import * as ort from '../../ort.js';
import {
  normalizeQuat,
  quatConjugate,
  quatMultiply,
  yawComponent,
  quatApplyInv,
  quatToRot6d
} from './utils/math.js';
import {
  generateOmniPlanCarryBoxWTACO,
  generateOmniPlanPushBox,
  generateOmniPlanPushBoxOld
} from './omniPlanCarryBoxWTACO.js';

const FUTURE_FRAMES = [0, 1, 2, 3, 4, 8, 12, 16, 24, 32, 50];
const HISTORY_SLICES = [
  [0, 15],
  [15, 18],
  [18, 21],
  [21, 50],
  [50, 79],
  [79, 108],
  [108, 111],
  [111, 117],
  [117, 141]
];
const HISTORY_LEN = 5;
const OBS_DIM = 1244;
const SINGLE_OBS_DIM = 141;
const TRACKING_DIM_PER_FRAME = 49;
const MAX_REL_NORM = 4.0;
const BODY_INDEX = {
  pelvis: 0,
  leftAnkle: 3,
  rightAnkle: 6,
  torso: 7,
  leftWrist: 10,
  rightWrist: 13
};

function normalizePlannerTask(task) {
  const key = String(task ?? 'carrybox').trim().toLowerCase().replace(/_/g, '-');
  if (key === 'push' || key === 'pushbox') {
    return 'pushbox';
  }
  if (key === 'push-old' || key === 'pushbox-old' || key === 'old-push') {
    return 'pushbox-old';
  }
  return 'carrybox';
}

function taskBoxHalfDims(task, carryDims, pushDims) {
  const normalized = normalizePlannerTask(task);
  return normalized === 'pushbox' || normalized === 'pushbox-old' ? pushDims : carryDims;
}

function taskObjectBodyName(task) {
  return 'box';
}

function buildBboxOffsets(dims) {
  const hx = Number(dims?.[0] ?? 0.15);
  const hy = Number(dims?.[1] ?? 0.15);
  const hz = Number(dims?.[2] ?? 0.15);
  return [
    [hx, hy, hz], [hx, hy, -hz], [hx, -hy, hz], [hx, -hy, -hz],
    [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, hz], [-hx, -hy, -hz]
  ];
}

function toFloatArray(value, length, fallback = 0.0) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = value?.[i] ?? fallback;
  }
  return out;
}

function copyVec(src, offset, length) {
  return Array.from(src.slice(offset, offset + length));
}

function clipVec(v, maxNorm = MAX_REL_NORM) {
  const norm = Math.hypot(...v);
  if (norm <= maxNorm || norm < 1e-8) {
    return v;
  }
  const scale = maxNorm / norm;
  return v.map((x) => x * scale);
}

function quatApply(quat, vec) {
  const q = normalizeQuat(quat);
  const qc = quatConjugate(q);
  const vq = [0, vec[0], vec[1], vec[2]];
  const r = quatMultiply(quatMultiply(q, vq), qc);
  return [r[1], r[2], r[3]];
}

function rotateRel(headingConj, pos, origin) {
  return quatApply(headingConj, [
    pos[0] - origin[0],
    pos[1] - origin[1],
    pos[2] - origin[2]
  ]);
}

function relQuat6d(headingConj, quat) {
  return quatToRot6d(quatMultiply(headingConj, quat));
}

function yawToQuat(yaw) {
  return [Math.cos(0.5 * yaw), 0, 0, Math.sin(0.5 * yaw)];
}

function slerpQuat(q0, q1, t) {
  const a = normalizeQuat(q0);
  let b = normalizeQuat(q1);
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (dot < 0) {
    dot = -dot;
    b = b.map((v) => -v);
  }
  if (dot > 0.9995) {
    const out = a.map((v, i) => v + t * (b[i] - v));
    return normalizeQuat(out);
  }
  const theta0 = Math.acos(Math.max(-1, Math.min(1, dot)));
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
  const s1 = sinTheta / sinTheta0;
  return normalizeQuat(a.map((v, i) => s0 * v + s1 * b[i]));
}

function lerpVec(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function interpCount(a, b, step, minCount = 2) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return Math.max(minCount, Math.floor(d / step) + 1);
}

function subtractFrameTransforms(parentPos, parentQuat, childPos, childQuat) {
  const invParent = quatConjugate(normalizeQuat(parentQuat));
  const relPos = quatApply(invParent, [
    childPos[0] - parentPos[0],
    childPos[1] - parentPos[1],
    childPos[2] - parentPos[2]
  ]);
  const relQuat = quatMultiply(invParent, normalizeQuat(childQuat));
  return [relPos, relQuat];
}

function inferReferenceFramesFromMetadata(session, fallback = 900) {
  const meta = session.outputMetadata?.find((entry) => entry?.name === 'joint_pos');
  const dim0 = meta?.dimensions?.[0];
  return Number.isInteger(dim0) && dim0 > 1 ? dim0 : fallback;
}

function releaseOrtOutputs(outputs) {
  for (const tensor of Object.values(outputs ?? {})) {
    if (tensor?.dispose) {
      tensor.dispose();
    }
  }
}

export class CarryBoxWTACPolicyRunner {
  constructor(config, runtime) {
    this.config = config;
    this.bodyNameToId = runtime.bodyNameToId ?? {};
    this.readBodyPose = runtime.readBodyPose;
    this.numActions = 29;
    this.inputObs = new Float32Array(OBS_DIM);
    this.zeroObs = new Float32Array(OBS_DIM);
    this.timeStep = new Float32Array(1);
    this.history = Array.from({ length: HISTORY_LEN }, () => new Float32Array(SINGLE_OBS_DIM));
    this.currProp = new Float32Array(SINGLE_OBS_DIM);
    this.historyFlat = new Float32Array(HISTORY_LEN * SINGLE_OBS_DIM);
    this.action = new Float32Array(this.numActions);
    this.target = new Float32Array(this.numActions);
    this.defaultAnglesLab = toFloatArray(config.default_angles_lab, this.numActions, 0.0);
    this.actionScaleLab = toFloatArray(config.action_scale_lab, this.numActions, 1.0);
    this.lab2mj = Array.from(config.lab2mj ?? Array.from({ length: this.numActions }, (_, i) => i));
    this.mj2lab = Array.from(config.mj2lab ?? Array.from({ length: this.numActions }, (_, i) => i));
    this.referenceSource = config.reference_source ?? 'rule_planner';
    this.task = normalizePlannerTask(config.task ?? config.planner_task ?? 'carrybox');
    this.goalPos = new Float32Array(config.goal_pos ?? [1.0, 1.0, 0.55]);
    this.carryBoxHalfDims = new Float32Array(config.box_half_dims ?? [0.15, 0.15, 0.15]);
    this.pushBoxHalfDims = new Float32Array(config.push_box_half_dims ?? [0.23, 0.25, 0.26]);
    this.boxHalfDims = new Float32Array(taskBoxHalfDims(this.task, this.carryBoxHalfDims, this.pushBoxHalfDims));
    this.bboxOffsets = buildBboxOffsets(this.boxHalfDims);
    this.objectBodyName = taskObjectBodyName(this.task);
    this.objectQuatOverride = null;
    this.counterStep = 0;
    this.isInferencing = false;
  }

  async init() {
    const response = await fetch(this.config.onnx.path);
    if (!response.ok) {
      throw new Error(`Failed to load WTAC ONNX from ${this.config.onnx.path}: ${response.status}`);
    }
    const modelBuffer = await response.arrayBuffer();
    this.session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      enableMemPattern: false,
      enableCpuMemArena: false
    });
    this.obsName = this.session.inputNames[0] ?? 'obs';
    this.timeName = this.session.inputNames[1] ?? 'time_step';
    this.nframes = this.config.reference_frames ?? inferReferenceFramesFromMetadata(this.session);
    if (this.referenceSource === 'onnx_ref') {
      await this._loadOnnxReference();
    }
  }

  async dispose() {
    if (this.session?.release) {
      await this.session.release();
    }
    this.session = null;
  }

  reset(state = null) {
    this.counterStep = 0;
    this.action.fill(0);
    for (const row of this.history) {
      row.fill(0);
    }
    if (this.referenceSource === 'rule_planner') {
      this._generatePlannerReference();
    } else if (state) {
      this._alignReferenceToState(state);
    }
  }

  _makeRefArrays(n) {
    this.nframes = n;
    this.refJointPos = Array.from({ length: n }, () => new Float32Array(this.numActions));
    this.refBasePos = Array.from({ length: n }, () => new Float32Array(3));
    this.refBaseQuat = Array.from({ length: n }, () => new Float32Array([1, 0, 0, 0]));
    this.refLeftWristPos = Array.from({ length: n }, () => new Float32Array(3));
    this.refLeftWristQuat = Array.from({ length: n }, () => new Float32Array([1, 0, 0, 0]));
    this.refRightWristPos = Array.from({ length: n }, () => new Float32Array(3));
    this.refRightWristQuat = Array.from({ length: n }, () => new Float32Array([1, 0, 0, 0]));
    this.refTorsoPos = Array.from({ length: n }, () => new Float32Array(3));
    this.refTorsoQuat = Array.from({ length: n }, () => new Float32Array([1, 0, 0, 0]));
    this.refLeftAnklePos = Array.from({ length: n }, () => new Float32Array(3));
    this.refLeftAnkleQuat = Array.from({ length: n }, () => new Float32Array([1, 0, 0, 0]));
    this.refRightAnklePos = Array.from({ length: n }, () => new Float32Array(3));
    this.refRightAnkleQuat = Array.from({ length: n }, () => new Float32Array([1, 0, 0, 0]));
    this.refObjectPos = Array.from({ length: n }, () => new Float32Array(3));
    this.refObjectQuat = Array.from({ length: n }, () => new Float32Array([1, 0, 0, 0]));
    this.refContact = Array.from({ length: n }, () => new Float32Array(4));
  }

  _generatePlannerReference() {
    const torso = this._poseFromBody('torso_link');
    const leftHand = this._poseFromBody('left_palm_link');
    const rightHand = this._poseFromBody('right_palm_link');
    const leftAnkle = this._poseFromBody('left_ankle_pitch_link');
    const rightAnkle = this._poseFromBody('right_ankle_pitch_link');
    const task = normalizePlannerTask(this.task);
    this.boxHalfDims = new Float32Array(taskBoxHalfDims(task, this.carryBoxHalfDims, this.pushBoxHalfDims));
    this.bboxOffsets = buildBboxOffsets(this.boxHalfDims);
    this.objectBodyName = taskObjectBodyName(task);
    const object = this._poseFromBody(this.objectBodyName, [1, 0, this.boxHalfDims[2]], [1, 0, 0, 0]);
    if (this.objectQuatOverride) {
      object.quat.set(this.objectQuatOverride);
    }
    const targetObjPos = Array.from(this.goalPos);
    if (task === 'pushbox' || task === 'pushbox-old') {
      targetObjPos[2] = this.boxHalfDims[2];
    }
    const generator = task === 'pushbox'
      ? generateOmniPlanPushBox
      : task === 'pushbox-old'
        ? generateOmniPlanPushBoxOld
        : generateOmniPlanCarryBoxWTACO;
    const traj = generator({
      torsoPos: torso.pos,
      torsoQuat: torso.quat,
      leftAnklePos: leftAnkle.pos,
      rightAnklePos: rightAnkle.pos,
      objPos: object.pos,
      objQuat: object.quat,
      boxHalfDims: this.boxHalfDims,
      targetObjPos,
      leftWristPos: leftHand.pos,
      leftWristQuat: leftHand.quat,
      rightWristPos: rightHand.pos,
      rightWristQuat: rightHand.quat
    });

    this._makeRefArrays(traj.refPhase.length);
    this.refPhase = traj.refPhase;
    for (let i = 0; i < this.nframes; i++) {
      this.refTorsoPos[i].set(traj.refTorsoPos[i]);
      this.refTorsoQuat[i].set(traj.refTorsoQuat[i]);
      this.refLeftAnklePos[i].set(traj.refLeftAnklePos[i]);
      this.refLeftAnkleQuat[i].set(traj.refLeftAnkleQuat[i]);
      this.refRightAnklePos[i].set(traj.refRightAnklePos[i]);
      this.refRightAnkleQuat[i].set(traj.refRightAnkleQuat[i]);
      this.refLeftWristPos[i].set(traj.refLeftWristPos[i]);
      this.refLeftWristQuat[i].set(traj.refLeftWristQuat[i]);
      this.refRightWristPos[i].set(traj.refRightWristPos[i]);
      this.refRightWristQuat[i].set(traj.refRightWristQuat[i]);
      this.refObjectPos[i].set(traj.refObjectPos[i]);
      this.refObjectQuat[i].set(traj.refObjectQuat[i]);
      this.refContact[i].set(traj.refContact[i]);
    }
    this.plannerGoal = {
      plane1: Float32Array.from([object.pos[0], object.pos[1], object.pos[2] - this.boxHalfDims[2] - 0.01]),
      plane2: Float32Array.from([targetObjPos[0], targetObjPos[1], targetObjPos[2] - this.boxHalfDims[2] - 0.01])
    };
    return;

    const obj = Array.from(object.pos);
    const goal = Array.from(this.goalPos);
    const torsoStart = Array.from(torso.pos);
    const yaw0 = yawComponent(torso.quat);
    const toObjYaw = yawToQuat(Math.atan2(obj[1] - torsoStart[1], obj[0] - torsoStart[0]));

    const dims = Array.from(this.boxHalfDims);
    const ax = quatApply(object.quat, [1, 0, 0]);
    const ay = quatApply(object.quat, [0, 1, 0]);
    const candidates = [
      { pos: [obj[0] + ax[0] * dims[0], obj[1] + ax[1] * dims[0], obj[2] + ax[2] * dims[0]], normal: ax, width: dims[1] },
      { pos: [obj[0] - ax[0] * dims[0], obj[1] - ax[1] * dims[0], obj[2] - ax[2] * dims[0]], normal: ax.map((v) => -v), width: dims[1] },
      { pos: [obj[0] + ay[0] * dims[1], obj[1] + ay[1] * dims[1], obj[2] + ay[2] * dims[1]], normal: ay, width: dims[0] },
      { pos: [obj[0] - ay[0] * dims[1], obj[1] - ay[1] * dims[1], obj[2] - ay[2] * dims[1]], normal: ay.map((v) => -v), width: dims[0] }
    ];
    candidates.sort((a, b) => Math.hypot(a.pos[0] - torsoStart[0], a.pos[1] - torsoStart[1]) - Math.hypot(b.pos[0] - torsoStart[0], b.pos[1] - torsoStart[1]));
    const face = candidates[0];
    const approachDir = face.normal.map((v) => -v);
    const faceYaw = yawToQuat(Math.atan2(approachDir[1], approachDir[0]));
    const pitchDown = [0.7017, 0, 0.7017, 0];
    const qPre = quatMultiply(faceYaw, pitchDown);
    const qGrasp = quatMultiply(faceYaw, [0.717, 0, 0.717, 0]);

    const fwd = quatApply(faceYaw, [1, 0, 0]);
    const stand = [obj[0] - fwd[0] * 0.62, obj[1] - fwd[1] * 0.62, 0.793];
    const preCenter = [obj[0] - fwd[0] * 0.38, obj[1] - fwd[1] * 0.38, Math.max(obj[2], 0.7)];
    const graspCenter = obj.slice();
    const liftObj = [obj[0], obj[1], Math.max(obj[2] + 0.35, 0.85)];
    const carryGoal = [goal[0], goal[1], Math.max(goal[2], liftObj[2])];
    const placeObj = [goal[0], goal[1], goal[2]];

    const frames = [];
    const pushFrame = (phase, tPos, tQuat, lPos, lQuat, rPos, rQuat, oPos, oQuat, contact) => {
      frames.push({
        phase,
        torsoPos: Float32Array.from(tPos),
        torsoQuat: Float32Array.from(tQuat),
        leftAnklePos: Float32Array.from(leftAnkle.pos),
        leftAnkleQuat: Float32Array.from(leftAnkle.quat),
        rightAnklePos: Float32Array.from(rightAnkle.pos),
        rightAnkleQuat: Float32Array.from(rightAnkle.quat),
        leftWristPos: Float32Array.from(lPos),
        leftWristQuat: Float32Array.from(lQuat),
        rightWristPos: Float32Array.from(rPos),
        rightWristQuat: Float32Array.from(rQuat),
        objectPos: Float32Array.from(oPos),
        objectQuat: Float32Array.from(oQuat),
        contact: Float32Array.from(contact)
      });
    };
    const handsFromCenter = (center, yawQ, halfWidth) => {
      const y = quatApply(yawQ, [0, 1, 0]);
      return [
        [center[0] + y[0] * halfWidth, center[1] + y[1] * halfWidth, center[2] + y[2] * halfWidth],
        [center[0] - y[0] * halfWidth, center[1] - y[1] * halfWidth, center[2] - y[2] * halfWidth]
      ];
    };
    const addSegment = (phase, n, fn) => {
      for (let i = 0; i < n; i++) {
        fn(n <= 1 ? 1 : i / (n - 1), i);
      }
    };
    const startL = Array.from(leftHand.pos);
    const startR = Array.from(rightHand.pos);
    const startLQ = Array.from(leftHand.quat);
    const startRQ = Array.from(rightHand.quat);
    const openWidth = Math.max(0.24, Math.hypot(startL[0] - startR[0], startL[1] - startR[1], startL[2] - startR[2]) * 0.5);
    const graspWidth = Math.max(face.width - 0.02, 0.1);

    addSegment(11, 40, (u) => {
      const q = slerpQuat(yaw0, toObjYaw, u);
      const tq = q;
      const tp = lerpVec(torsoStart, [torsoStart[0], torsoStart[1], 0.793], u);
      const c = lerpVec([(startL[0] + startR[0]) * 0.5, (startL[1] + startR[1]) * 0.5, (startL[2] + startR[2]) * 0.5], [tp[0], tp[1], tp[2] - 0.13], u);
      const [lp, rp] = handsFromCenter(c, q, openWidth);
      const lq = slerpQuat(startLQ, quatMultiply(q, pitchDown), u);
      const rq = slerpQuat(startRQ, quatMultiply(q, pitchDown), u);
      pushFrame(11, tp, tq, lp, lq, rp, rq, obj, object.quat, [0, 0, 0, 0]);
    });
    addSegment(12, interpCount(torsoStart, stand, 0.02, 30), (u) => {
      const tp = lerpVec(torsoStart, stand, u);
      const q = slerpQuat(toObjYaw, faceYaw, u);
      const c = lerpVec([tp[0], tp[1], tp[2] - 0.13], preCenter, u);
      const [lp, rp] = handsFromCenter(c, q, openWidth);
      const lq = quatMultiply(q, pitchDown);
      pushFrame(12, tp, q, lp, lq, rp, lq, obj, object.quat, [0, 0, 0, 0]);
    });
    addSegment(14, 55, (u) => {
      const c = lerpVec(preCenter, graspCenter, u);
      const [lp, rp] = handsFromCenter(c, faceYaw, openWidth + (graspWidth - openWidth) * u);
      const q = slerpQuat(qPre, qGrasp, u);
      const tp = lerpVec(stand, [stand[0], stand[1], Math.min(stand[2], 0.62)], u);
      pushFrame(14, tp, faceYaw, lp, q, rp, q, obj, object.quat, [0, 0, 0, 0]);
    });
    for (let i = 0; i < 30; i++) {
      const [lp, rp] = handsFromCenter(graspCenter, faceYaw, graspWidth);
      pushFrame(15, [stand[0], stand[1], Math.min(stand[2], 0.62)], faceYaw, lp, qGrasp, rp, qGrasp, obj, object.quat, [0, 0, 1, 1]);
    }
    addSegment(21, 60, (u) => {
      const o = lerpVec(obj, liftObj, u);
      const [lp, rp] = handsFromCenter(o, faceYaw, graspWidth);
      const tp = lerpVec([stand[0], stand[1], Math.min(stand[2], 0.62)], stand, u);
      pushFrame(21, tp, faceYaw, lp, qGrasp, rp, qGrasp, o, object.quat, [0, 0, 1, 1]);
    });
    addSegment(23, interpCount(liftObj, carryGoal, 0.02, 50), (u) => {
      const o = lerpVec(liftObj, carryGoal, u);
      const q = yawToQuat(Math.atan2(goal[1] - obj[1], goal[0] - obj[0]));
      const [lp, rp] = handsFromCenter(o, q, graspWidth);
      const tp = [o[0] - fwd[0] * 0.62, o[1] - fwd[1] * 0.62, 0.793];
      pushFrame(23, tp, q, lp, qGrasp, rp, qGrasp, o, object.quat, [0, 0, 1, 1]);
    });
    addSegment(25, 45, (u) => {
      const o = lerpVec(carryGoal, placeObj, u);
      const [lp, rp] = handsFromCenter(o, faceYaw, graspWidth + 0.12 * u);
      const tp = [stand[0], stand[1], 0.793];
      pushFrame(25, tp, faceYaw, lp, qGrasp, rp, qGrasp, o, object.quat, u > 0.5 ? [0, 0, 0, 0] : [0, 0, 1, 1]);
    });
    for (let i = 0; i < 40; i++) {
      const [lp, rp] = handsFromCenter(placeObj, faceYaw, openWidth);
      pushFrame(26, [stand[0], stand[1], 0.793], faceYaw, lp, qPre, rp, qPre, placeObj, object.quat, [0, 0, 0, 0]);
    }

    this._makeRefArrays(frames.length);
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      this.refTorsoPos[i].set(f.torsoPos);
      this.refTorsoQuat[i].set(f.torsoQuat);
      this.refLeftAnklePos[i].set(f.leftAnklePos);
      this.refLeftAnkleQuat[i].set(f.leftAnkleQuat);
      this.refRightAnklePos[i].set(f.rightAnklePos);
      this.refRightAnkleQuat[i].set(f.rightAnkleQuat);
      this.refLeftWristPos[i].set(f.leftWristPos);
      this.refLeftWristQuat[i].set(f.leftWristQuat);
      this.refRightWristPos[i].set(f.rightWristPos);
      this.refRightWristQuat[i].set(f.rightWristQuat);
      this.refObjectPos[i].set(f.objectPos);
      this.refObjectQuat[i].set(f.objectQuat);
      this.refContact[i].set(f.contact);
    }
    this.plannerGoal = {
      plane1: Float32Array.from([obj[0], obj[1], obj[2] - this.boxHalfDims[2] - 0.01]),
      plane2: Float32Array.from([goal[0], goal[1], goal[2] - this.boxHalfDims[2] - 0.01])
    };
  }

  async _runRaw(obsData, time) {
    this.timeStep[0] = time;
    const feeds = {
      [this.obsName]: new ort.Tensor('float32', obsData, [1, OBS_DIM]),
      [this.timeName]: new ort.Tensor('float32', this.timeStep, [1, 1])
    };
    try {
      return await this.session.run(feeds);
    } finally {
      releaseOrtOutputs(feeds);
    }
  }

  async _loadOnnxReference() {
    const n = this.nframes;
    this._makeRefArrays(n);

    for (let i = 0; i < n; i++) {
      const out = await this._runRaw(this.zeroObs, i);
      try {
        const jointPos = out.joint_pos?.data;
        const bodyPos = out.body_pos_w?.data;
        const bodyQuat = out.body_quat_w?.data;
        const objectPos = out.object_pos_w?.data;
        const objectQuat = out.object_quat_w?.data;
        const contact = out.contact_info?.data;
        if (!jointPos || !bodyPos || !bodyQuat || !objectPos || !objectQuat || !contact) {
          throw new Error('WTAC ONNX reference outputs are missing required tensors.');
        }
        this.refJointPos[i].set(jointPos);
        this.refBasePos[i].set(copyVec(bodyPos, BODY_INDEX.pelvis * 3, 3));
        this.refBaseQuat[i].set(copyVec(bodyQuat, BODY_INDEX.pelvis * 4, 4));
        this.refTorsoPos[i].set(copyVec(bodyPos, BODY_INDEX.torso * 3, 3));
        this.refTorsoQuat[i].set(copyVec(bodyQuat, BODY_INDEX.torso * 4, 4));
        this.refLeftAnklePos[i].set(copyVec(bodyPos, BODY_INDEX.leftAnkle * 3, 3));
        this.refLeftAnkleQuat[i].set(copyVec(bodyQuat, BODY_INDEX.leftAnkle * 4, 4));
        this.refRightAnklePos[i].set(copyVec(bodyPos, BODY_INDEX.rightAnkle * 3, 3));
        this.refRightAnkleQuat[i].set(copyVec(bodyQuat, BODY_INDEX.rightAnkle * 4, 4));
        this.refLeftWristPos[i].set(copyVec(bodyPos, BODY_INDEX.leftWrist * 3, 3));
        this.refLeftWristQuat[i].set(copyVec(bodyQuat, BODY_INDEX.leftWrist * 4, 4));
        this.refRightWristPos[i].set(copyVec(bodyPos, BODY_INDEX.rightWrist * 3, 3));
        this.refRightWristQuat[i].set(copyVec(bodyQuat, BODY_INDEX.rightWrist * 4, 4));
        this.refObjectPos[i].set(objectPos);
        this.refObjectQuat[i].set(objectQuat);
        for (let j = 0; j < 4; j++) {
          this.refContact[i][j] = contact[j];
        }
      } finally {
        releaseOrtOutputs(out);
      }
    }
  }

  _alignReferenceToState(state) {
    const initBase = state.rootPos;
    const initYaw = yawComponent(state.rootQuat);
    const refInitBase = this.refBasePos[0];
    const refInitYaw = yawComponent(this.refBaseQuat[0]);
    const deltaYaw = quatMultiply(quatConjugate(refInitYaw), initYaw);
    const posRefs = [
      this.refBasePos, this.refLeftWristPos, this.refRightWristPos, this.refTorsoPos,
      this.refLeftAnklePos, this.refRightAnklePos, this.refObjectPos
    ];
    const quatRefs = [
      this.refBaseQuat, this.refLeftWristQuat, this.refRightWristQuat, this.refTorsoQuat,
      this.refLeftAnkleQuat, this.refRightAnkleQuat, this.refObjectQuat
    ];
    for (let i = 0; i < this.nframes; i++) {
      for (const arr of posRefs) {
        const rel = [arr[i][0] - refInitBase[0], arr[i][1] - refInitBase[1], arr[i][2] - refInitBase[2]];
        const rot = quatApply(deltaYaw, rel);
        arr[i][0] = rot[0] + initBase[0];
        arr[i][1] = rot[1] + initBase[1];
        arr[i][2] = rot[2] + initBase[2];
      }
      for (const arr of quatRefs) {
        arr[i].set(quatMultiply(deltaYaw, arr[i]));
      }
    }
    this.referenceAligned = true;
  }

  _poseFromBody(name, fallbackPos = [0, 0, 0], fallbackQuat = [1, 0, 0, 0]) {
    const id = this.bodyNameToId[name];
    if (id === undefined || !this.readBodyPose) {
      return { pos: fallbackPos, quat: fallbackQuat };
    }
    return this.readBodyPose(id);
  }

  _buildFutureObs(torsoPos, torsoQuat) {
    const headingConj = quatConjugate(yawComponent(torsoQuat));
    const out = new Float32Array(FUTURE_FRAMES.length * TRACKING_DIM_PER_FRAME);
    let offset = 0;
    const contactOffset = FUTURE_FRAMES.length * (TRACKING_DIM_PER_FRAME - 4);
    let contactWriteOffset = contactOffset;
    const writePose = (posRef, quatRef, idx) => {
      out.set(rotateRel(headingConj, posRef[idx], torsoPos), offset);
      offset += 3;
      out.set(relQuat6d(headingConj, quatRef[idx]), offset);
      offset += 6;
    };

    for (const frame of FUTURE_FRAMES) {
      const idx = Math.min(this.counterStep + frame, this.nframes - 1);
      writePose(this.refLeftWristPos, this.refLeftWristQuat, idx);
      writePose(this.refRightWristPos, this.refRightWristQuat, idx);
      writePose(this.refTorsoPos, this.refTorsoQuat, idx);
      writePose(this.refLeftAnklePos, this.refLeftAnkleQuat, idx);
      writePose(this.refRightAnklePos, this.refRightAnkleQuat, idx);
      out.set(this.refContact[idx], contactWriteOffset);
      contactWriteOffset += 4;
    }
    return out;
  }

  _buildBboxRel(objectPos, objectQuat, torsoPos, torsoQuat) {
    const headingConj = quatConjugate(yawComponent(torsoQuat));
    const out = new Float32Array(24);
    let offset = 0;
    for (const corner of this.bboxOffsets) {
      const world = quatApply(objectQuat, corner);
      world[0] += objectPos[0];
      world[1] += objectPos[1];
      world[2] += objectPos[2];
      out.set(clipVec(rotateRel(headingConj, world, torsoPos)), offset);
      offset += 3;
    }
    return out;
  }

  _flattenHistory() {
    let offset = 0;
    for (const [a, b] of HISTORY_SLICES) {
      for (let h = 0; h < HISTORY_LEN; h++) {
        this.historyFlat.set(this.history[h].slice(a, b), offset);
        offset += b - a;
      }
    }
    return this.historyFlat;
  }

  async step(state) {
    if (this.isInferencing) {
      return null;
    }
    this.isInferencing = true;
    try {
      const torso = this._poseFromBody('torso_link', state.rootPos, state.rootQuat);
      const leftHand = this._poseFromBody('left_palm_link', state.rootPos, state.rootQuat);
      const rightHand = this._poseFromBody('right_palm_link', state.rootPos, state.rootQuat);
      const leftAnkle = this._poseFromBody('left_ankle_pitch_link', state.rootPos, state.rootQuat);
      const rightAnkle = this._poseFromBody('right_ankle_pitch_link', state.rootPos, state.rootQuat);
      const mid360 = this._poseFromBody('mid360_link', state.rootPos, state.rootQuat);
      const object = this._poseFromBody(this.objectBodyName, this.refObjectPos[Math.min(this.counterStep, this.nframes - 1)], this.refObjectQuat[Math.min(this.counterStep, this.nframes - 1)]);

      const eePos = [
        ...quatApplyInv(torso.quat, [leftHand.pos[0] - torso.pos[0], leftHand.pos[1] - torso.pos[1], leftHand.pos[2] - torso.pos[2]]),
        ...quatApplyInv(torso.quat, [rightHand.pos[0] - torso.pos[0], rightHand.pos[1] - torso.pos[1], rightHand.pos[2] - torso.pos[2]]),
        ...quatApplyInv(torso.quat, [leftAnkle.pos[0] - torso.pos[0], leftAnkle.pos[1] - torso.pos[1], leftAnkle.pos[2] - torso.pos[2]]),
        ...quatApplyInv(torso.quat, [rightAnkle.pos[0] - torso.pos[0], rightAnkle.pos[1] - torso.pos[1], rightAnkle.pos[2] - torso.pos[2]]),
        ...quatApplyInv(torso.quat, [mid360.pos[0] - torso.pos[0], mid360.pos[1] - torso.pos[1], mid360.pos[2] - torso.pos[2]])
      ];
      const gravityOri = quatApplyInv(state.rootQuat, [0, 0, -1]);
      const qj = new Float32Array(this.numActions);
      const dqj = new Float32Array(this.numActions);
      for (let i = 0; i < this.numActions; i++) {
        const mjIdx = this.mj2lab[i];
        qj[i] = state.jointPos[mjIdx] - this.defaultAnglesLab[i];
        dqj[i] = state.jointVel[mjIdx];
      }
      const [objPosRel, objQuatRel] = subtractFrameTransforms(torso.pos, yawComponent(torso.quat), object.pos, object.quat);
      const objRot6d = quatToRot6d(objQuatRel);
      const bboxRel = this._buildBboxRel(object.pos, object.quat, torso.pos, torso.quat);

      let o = 0;
      this.currProp.set(eePos, o); o += 15;
      this.currProp.set(state.rootAngVel, o); o += 3;
      this.currProp.set(gravityOri, o); o += 3;
      this.currProp.set(qj, o); o += 29;
      this.currProp.set(dqj, o); o += 29;
      this.currProp.set(this.action, o); o += 29;
      this.currProp.set(clipVec(objPosRel), o); o += 3;
      this.currProp.set(objRot6d, o); o += 6;
      this.currProp.set(bboxRel, o);

      for (let i = 0; i < HISTORY_LEN - 1; i++) {
        this.history[i].set(this.history[i + 1]);
      }
      this.history[HISTORY_LEN - 1].set(this.currProp);

      const trackingObs = this._buildFutureObs(torso.pos, torso.quat);
      this.inputObs.set(trackingObs, 0);
      this.inputObs.set(this._flattenHistory(), trackingObs.length);
      const out = await this._runRaw(this.inputObs, 0.0);
      try {
        const rawAction = out.actions?.data;
        if (!rawAction || rawAction.length !== this.numActions) {
          throw new Error('WTAC ONNX did not return a valid actions tensor.');
        }
        this.action.set(rawAction);
      } finally {
        releaseOrtOutputs(out);
      }
      for (let i = 0; i < this.numActions; i++) {
        const labIdx = this.lab2mj[i];
        this.target[i] = this.action[labIdx] * this.actionScaleLab[labIdx] + this.defaultAnglesLab[labIdx];
      }
      this.counterStep = Math.min(this.counterStep + 1, this.nframes - 1);
      return this.target;
    } finally {
      this.isInferencing = false;
    }
  }

  currentReferenceFrame() {
    const idx = Math.min(this.counterStep, this.nframes - 1);
    return {
      idx,
      leftWrist: [this.refLeftWristPos[idx], this.refLeftWristQuat[idx]],
      rightWrist: [this.refRightWristPos[idx], this.refRightWristQuat[idx]],
      torso: [this.refTorsoPos[idx], this.refTorsoQuat[idx]],
      leftAnkle: [this.refLeftAnklePos[idx], this.refLeftAnkleQuat[idx]],
      rightAnkle: [this.refRightAnklePos[idx], this.refRightAnkleQuat[idx]],
      plane1: this.plannerGoal?.plane1 ?? null,
      plane2: this.plannerGoal?.plane2 ?? null
    };
  }
}
