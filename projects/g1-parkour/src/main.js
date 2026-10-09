
import * as THREE           from 'three';
import { mountInterface } from './interface.js';
import { OrbitControls    } from 'three/examples/jsm/controls/OrbitControls.js';
import { DragStateManager } from './utils/DragStateManager.js';
import { setupGUI, downloadExampleScenesFolder, loadSceneFromURL, drawTendonsAndFlex, getPosition, getQuaternion, toMujocoPos, standardNormal } from './mujocoUtils.js';
import { PolicyController } from './policy/policyController.js';
import { RELEASE_DEPTH } from './policy/releaseContract.js';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import ortModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url';
import   load_mujoco        from 'mujoco-js/dist/mujoco_wasm.js';

// Load the MuJoCo Module
const mujoco = await load_mujoco();

// Set up Emscripten's Virtual File System
var initialScene = "g1_release_terrain.xml";
const terrainObstacles = Array.from({ length: 12 }, (_, index) => ({
  name: `terrain_box_${index + 2}`,
  x: (index + 1) * 5,
  y: 0,
}));
const obstacleWarningDistance = 2.0;
const obstacleWarningMinApproachSpeed = 0.3;
const obstacleWarningHoldMs = 800;
mujoco.FS.mkdir('/working');
mujoco.FS.mount(mujoco.MEMFS, { root: '.' }, '/working');
mujoco.FS.writeFile("/working/" + initialScene, await(await fetch("./scenes/" + initialScene)).text());

export class MuJoCoDemo {
  constructor() {
    this.mujoco = mujoco;

    // Model and data will be created once assets are available in init()
    this.model = null;
    this.data  = null;

    // Define Random State Variables
    this.params = { scene: initialScene, paused: false, help: false, ctrlnoiserate: 0.0, ctrlnoisestd: 0.0, keyframeNumber: 0, policyEnabled: true, showRawDepth: false };
    this.mujoco_time = 0.0;
    this.bodies  = {}, this.lights = {};
    this.tmpVec  = new THREE.Vector3();
    this.tmpQuat = new THREE.Quaternion();
    this.updateGUICallbacks = [];
    this.policyController = null;
    this.policyStepCounter = 0;
    this.policyDecimation = 1;
    this.obstacleWarningActive = null;
    this.obstacleWarningLastActiveTime = -Infinity;
    this.obstacleWarningTargetName = null;
    this.highlightedObstacleName = null;
    this.pelvisFollowOffset = new THREE.Vector3(-4.0, 1.5, 0.0);
    this.container = document.createElement( 'div' );
    document.body.appendChild( this.container );
    this.scene = new THREE.Scene();
    this.scene.name = 'scene';

    this.camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.001, 500 );
    this.camera.name = 'PerspectiveCamera';
    this.camera.position.set(2.0, 1.7, 1.7);
    this.scene.add(this.camera);

    // Secondary camera for depth inset view.
    // Match d435i depth config in far-tracking.
    this.depthCameraConfig = {
      width: 106,
      height: 60,
      horizontalFovDeg: RELEASE_DEPTH.horizontalFovDeg,
      minRange: 0.3,
      maxRange: 3.0,
    };
    this.depthCameraView = new THREE.PerspectiveCamera(
      THREE.MathUtils.radToDeg(2 * Math.atan(
        Math.tan(THREE.MathUtils.degToRad(this.depthCameraConfig.horizontalFovDeg) / 2)
        / (this.depthCameraConfig.width / this.depthCameraConfig.height))),
      this.depthCameraConfig.width / this.depthCameraConfig.height,
      this.depthCameraConfig.minRange,
      this.depthCameraConfig.maxRange
    );
    this.depthCameraView.position.set(3.0, 2.0, 3.0);
    this.depthCameraView.lookAt(0, 0.7, 0);
    this.depthCameraView.layers.set(1);
    this.scene.add(this.depthCameraView);
    this.depthCameraPoseViz = new THREE.Group();
    this.depthCameraPoseViz.name = 'DepthCameraPoseViz';
    this.depthCameraMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xff4d9d })
    );
    this.depthCameraPoseViz.add(this.depthCameraMarker);
    this.depthCameraView.add(this.depthCameraPoseViz);

    this.scene.background = new THREE.Color(0x101617);
    // Fog: (color, near, far). Increase far so distant terrain stays visible.
    // this.scene.fog = new THREE.Fog(this.scene.background, 30, 120);

    this.ambientLight = new THREE.AmbientLight( 0xffffff, 0.1 * 3.14 );
    this.ambientLight.name = 'AmbientLight';
    this.scene.add( this.ambientLight );

    this.spotlight = new THREE.SpotLight();
    this.spotlight.angle = 1.11;
    this.spotlight.distance = 10000;
    this.spotlight.penumbra = 0.5;
    this.spotlight.castShadow = false; // default false
    this.spotlight.intensity = this.spotlight.intensity * 3.14 * 10.0;
    this.spotlight.shadow.mapSize.width = 1024; // default
    this.spotlight.shadow.mapSize.height = 1024; // default
    this.spotlight.shadow.camera.near = 0.1; // default
    this.spotlight.shadow.camera.far = 100; // default
    this.spotlight.position.set(0, 3, 3);
    const targetObject = new THREE.Object3D();
    this.scene.add(targetObject);
    this.spotlight.target = targetObject;
    targetObject.position.set(0, 1, 0);
    this.scene.add( this.spotlight );

    // Extra fill lights for clearer scene visibility.
    this.hemiLight = new THREE.HemisphereLight(0xbfd8ff, 0x1f2a3a, 0.35 * 2.0);
    this.hemiLight.position.set(0, 6, 0);
    this.scene.add(this.hemiLight);

    this.fillLightLeft = new THREE.DirectionalLight(0xffffff, 0.28 * 2.0);
    this.fillLightLeft.position.set(-4, 3, 2);
    this.scene.add(this.fillLightLeft);

    this.fillLightRight = new THREE.DirectionalLight(0xffffff, 0.22 * 2.0);
    this.fillLightRight.position.set(4, 2.5, -1.5);
    this.scene.add(this.fillLightRight);

    this.renderer = new THREE.WebGLRenderer( { antialias: true } );
    if (!this.renderer.extensions.has('EXT_color_buffer_float')) {
      throw new Error('This GPU cannot render the floating-point depth sensor (EXT_color_buffer_float)');
    }
    this.renderer.setPixelRatio(1.0);////window.devicePixelRatio );
    this.renderer.setSize( window.innerWidth, window.innerHeight );
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
    THREE.ColorManagement.enabled = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    //this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    //this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    //this.renderer.toneMappingExposure = 2.0;
    this.renderer.useLegacyLights = true;

    this.container.appendChild( this.renderer.domElement );

    // Depth render target and material for visualization.
    // Keep render resolution fixed to the camera config.
    const depthPreviewScale = Number(import.meta.env.VITE_DEPTH_PREVIEW_SCALE ?? 4);
    this.depthInset = {
      width: this.depthCameraConfig.width,
      height: this.depthCameraConfig.height,
      margin: 16,
      previewScale: depthPreviewScale,
    };
    this.depthCameraView.aspect = this.depthCameraConfig.width / this.depthCameraConfig.height;
    this.depthCameraView.updateProjectionMatrix();
    this.depthTarget = new THREE.WebGLRenderTarget(
      this.depthInset.width,
      this.depthInset.height
    );
    this.depthTarget.texture.minFilter = THREE.NearestFilter;
    this.depthTarget.texture.magFilter = THREE.NearestFilter;
    this.depthTarget.texture.generateMipmaps = false;
    this.depthTarget.depthTexture = new THREE.DepthTexture();
    this.depthTarget.depthTexture.format = THREE.DepthFormat;
    this.depthTarget.depthTexture.type = THREE.FloatType;
    this.depthViewMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: this.depthTarget.depthTexture },
        cameraNear: { value: this.depthCameraView.near },
        cameraFar: { value: this.depthCameraView.far },
        depthScale: { value: 10.0 }, // clamp distance to improve contrast
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        #include <packing>
        uniform sampler2D tDepth;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float depthScale;
        varying vec2 vUv;
        void main() {
          float depth = texture2D(tDepth, vUv).x;
          float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
          float linearDepth = -viewZ;
          float v = clamp(linearDepth / depthScale, 0.0, 1.0);
          gl_FragColor = vec4(vec3(v), 1.0);
        }
      `,
    });
    this.depthRawScene = new THREE.Scene();
    this.depthCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.depthRawPixels = new Uint8Array(this.depthCameraConfig.width * this.depthCameraConfig.height * 4);
    this.depthRawTexture = new THREE.DataTexture(
      this.depthRawPixels,
      this.depthCameraConfig.width,
      this.depthCameraConfig.height,
      THREE.RGBAFormat
    );
    this.depthRawTexture.minFilter = THREE.NearestFilter;
    this.depthRawTexture.magFilter = THREE.NearestFilter;
    this.depthRawTexture.needsUpdate = true;
    this.depthRawMaterial = new THREE.MeshBasicMaterial({ map: this.depthRawTexture });
    this.depthRawMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.depthRawMaterial);
    this.depthRawScene.add(this.depthRawMesh);
    this.depthPreviewSize = { width: 87, height: 58 };
    this.depthProcessedInset = {
      width: this.depthPreviewSize.width,
      height: this.depthPreviewSize.height,
      gap: 8,
      scale: depthPreviewScale,
    };
    this.depthPreviewPixels = new Uint8Array(this.depthPreviewSize.width * this.depthPreviewSize.height * 4);
    this.depthPreviewTexture = new THREE.DataTexture(
      this.depthPreviewPixels,
      this.depthPreviewSize.width,
      this.depthPreviewSize.height,
      THREE.RGBAFormat
    );
    this.depthPreviewTexture.flipY = true; // The processed policy image is top-down.
    this.depthPreviewTexture.minFilter = THREE.NearestFilter;
    this.depthPreviewTexture.magFilter = THREE.NearestFilter;
    this.depthPreviewTexture.needsUpdate = true;
    this.depthPreviewMaterial = new THREE.MeshBasicMaterial({ map: this.depthPreviewTexture });
    this.depthPreviewMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.depthPreviewMaterial);
    this.depthProcessedScene = new THREE.Scene();
    this.depthProcessedScene.add(this.depthPreviewMesh);

    this.depthInferenceMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: this.depthTarget.depthTexture },
        cameraNear: { value: this.camera.near },
        cameraFar: { value: this.camera.far }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        #include <packing>
        uniform sampler2D tDepth;
        uniform float cameraNear;
        uniform float cameraFar;
        varying vec2 vUv;
        void main() {
          float depth = texture2D(tDepth, vUv).x;
          float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
          float linearDepth = -viewZ;
          gl_FragColor = vec4(linearDepth, 0.0, 0.0, 1.0);
        }
      `,
    });
    this.depthInferenceScene = new THREE.Scene();
    this.depthInferenceScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.depthInferenceMaterial));
    this.depthInferenceTarget = new THREE.WebGLRenderTarget(
      this.depthInset.width,
      this.depthInset.height,
      {
        type: THREE.FloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
      }
    );
    this.depthPixels = new Float32Array(this.depthInset.width * this.depthInset.height * 4);
    this.depthFrame = new Float32Array(this.depthInset.width * this.depthInset.height);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.7, 0);
    this.controls.panSpeed = 2;
    this.controls.zoomSpeed = 1;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.10;
    this.controls.screenSpacePanning = true;
    this.controls.update();

    window.addEventListener('resize', this.onWindowResize.bind(this));

    // Initialize the Drag State Manager.
    this.dragStateManager = new DragStateManager(this.scene, this.renderer, this.camera, this.renderer.domElement, this.controls);
  }

  async init() {
    // Download the the examples to MuJoCo's virtual file system
    await downloadExampleScenesFolder(mujoco);

    // Initialize the three.js Scene using the .xml Model in initialScene
    [this.model, this.data, this.bodies, this.lights] =
      await loadSceneFromURL(mujoco, initialScene, this);

    this.applySceneInitialState({ resetData: false, rebindCameras: true });



    await this.initPolicy();
    this.applySceneInitialState({ resetData: true, rebindCameras: true });
    mountInterface(this);

    // Start the render loop only after the model and assets are ready
    // Three.js does not await async frame callbacks; serialize physics and ONNX.
    this.renderInFlight = false;
    this.renderer.setAnimationLoop((timeMS) => {
      if (this.renderInFlight) return;
      this.renderInFlight = true;
      this.render(timeMS).catch((error) => {
        this.params.paused = true;
        console.error('Simulation stopped:', error);
        this.onError?.(error);
      }).finally(() => { this.renderInFlight = false; });
    });
  }

  bindTrackingTargets() {
    this.pelvisBody = Object.values(this.bodies).find(
      (body) => body && body.name === 'pelvis'
    );
    if (this.pelvisBody) {
      const pelvisPos = this.pelvisBody.position.clone();
      this.lastFollowPosition = pelvisPos.clone();
      this.camera.position.copy(pelvisPos).add(this.pelvisFollowOffset);
      this.controls.target.copy(pelvisPos);
      this.controls.update();
    }

    const depthAnchorCandidates = [
      'torso_link',
      'torso',
      'trunk',
      'waist_roll_link',
      'pelvis',
    ];
    this.depthCameraAnchorBody = depthAnchorCandidates
      .map((name) => Object.values(this.bodies).find((body) => body && body.name === name))
      .find((body) => !!body) || null;
    if (!this.depthCameraAnchorBody) {
      this.depthCameraAnchorBody =
        Object.values(this.bodies).find((body) => body && typeof body.name === 'string' && body.name.includes('torso')) ||
        this.pelvisBody ||
        null;
    }

    if (this.depthCameraAnchorBody) {
      this.depthCameraAnchorBody.add(this.depthCameraView);
      console.log('Depth camera anchor body:', this.depthCameraAnchorBody.name);

      const offsetPos = { x: 0.01, y: 0.01, z: 0.44 };
      this.depthCameraView.position.set(
        offsetPos.x,
        offsetPos.z,
        -offsetPos.y,
      );

      const deg2rad = THREE.MathUtils.degToRad;
      const xAxis = new THREE.Vector3(1, 0, 0);
      const yAxis = new THREE.Vector3(0, 1, 0);
      const zAxis = new THREE.Vector3(0, 0, 1);
      const rpyDegToMjQuat = (rollDeg, pitchDeg, yawDeg) => {
        const qx = new THREE.Quaternion().setFromAxisAngle(xAxis, deg2rad(rollDeg));
        const qy = new THREE.Quaternion().setFromAxisAngle(yAxis, deg2rad(pitchDeg));
        const qz = new THREE.Quaternion().setFromAxisAngle(zAxis, deg2rad(yawDeg));
        return qz.multiply(qy).multiply(qx);
      };
      const mjQuatToThreeQuat = (qMj) =>
        new THREE.Quaternion(-qMj.x, -qMj.z, qMj.y, -qMj.w);

      const qOffsetMj = rpyDegToMjQuat(1, 27, 1);
      const qBaseMj = rpyDegToMjQuat(0, 0, -90);
      const qSensorMj = qOffsetMj.multiply(qBaseMj);
      this.depthCameraView.quaternion.copy(mjQuatToThreeQuat(qSensorMj).normalize());
    } else {
      console.warn('Depth camera anchor body not found; using world-fixed camera.');
    }
  }

  captureDepthFrame() {
    this.mujoco.mj_forward(this.model, this.data);
    for (let b = 0; b < this.model.nbody; b++) {
      if (!this.bodies[b]) continue;
      getPosition(this.data.xpos, b, this.bodies[b].position);
      getQuaternion(this.data.xquat, b, this.bodies[b].quaternion);
      this.bodies[b].updateWorldMatrix();
    }
    this.renderer.setScissorTest(false);
    this.renderer.setRenderTarget(this.depthTarget);
    this.renderer.clear();
    this.renderer.render(this.scene, this.depthCameraView);
    this.depthInferenceMaterial.uniforms.cameraNear.value = this.depthCameraView.near;
    this.depthInferenceMaterial.uniforms.cameraFar.value = this.depthCameraView.far;
    this.renderer.setRenderTarget(this.depthInferenceTarget);
    this.renderer.clear();
    this.renderer.render(this.depthInferenceScene, this.depthCamera);
    this.renderer.readRenderTargetPixels(this.depthInferenceTarget, 0, 0,
      this.depthInset.width, this.depthInset.height, this.depthPixels);
    this.renderer.setRenderTarget(null);
    for (let i = 0; i < this.depthFrame.length; i++) this.depthFrame[i] = this.depthPixels[i * 4];
    this.policyController.setDepthImage(this.depthFrame, this.depthInset.width, this.depthInset.height);
  }

  updateSpeedModeIndicator() {
    if (!this.speedModeElement) {
      return;
    }
    const isHighSpeed = this.policyController ? this.policyController.highSpeedMode !== false : true;
    this.speedModeElement.textContent = `Speed: ${isHighSpeed ? 'HIGH' : 'LOW'}`;
  }

  updateObstacleWarning() {
    const isTerrainScene = this.params.scene === initialScene;
    const pelvisX = this.data.qpos[0];
    const pelvisY = this.data.qpos[1];
    const velocityX = this.data.qvel[0];
    const velocityY = this.data.qvel[1];
    const now = performance.now();

    let target = null;
    if (isTerrainScene) {
      for (const obstacle of terrainObstacles) {
        const deltaX = obstacle.x - pelvisX;
        const deltaY = obstacle.y - pelvisY;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance <= 1e-6 || distance > obstacleWarningDistance) {
          continue;
        }

        const approachSpeed = (velocityX * deltaX + velocityY * deltaY) / distance;
        if (approachSpeed <= obstacleWarningMinApproachSpeed) {
          continue;
        }

        if (!target || distance < target.distance) {
          target = { ...obstacle, distance };
        }
      }
    }

    if (target) {
      this.obstacleWarningLastActiveTime = now;
      this.obstacleWarningTargetName = target.name;
    } else if (!isTerrainScene || now - this.obstacleWarningLastActiveTime >= obstacleWarningHoldMs) {
      this.obstacleWarningTargetName = null;
    }

    const isWarningActive = this.obstacleWarningTargetName !== null;
    this.updateObstacleHighlight(this.obstacleWarningTargetName, now);

    if (isWarningActive === this.obstacleWarningActive) {
      return;
    }
    this.obstacleWarningActive = isWarningActive;
    window.parent.postMessage({
      type: 'php-obstacle-warning',
      active: isWarningActive,
      target: this.obstacleWarningTargetName,
    }, window.location.origin);
  }

  updateObstacleHighlight(targetName, timeMS) {
    if (targetName !== this.highlightedObstacleName) {
      const previousMesh = this.terrainObstacleMeshes?.get(this.highlightedObstacleName);
      if (previousMesh) {
        previousMesh.userData.highlightOutline.visible = false;
      }
      this.highlightedObstacleName = targetName;
    }

    const targetMesh = this.terrainObstacleMeshes?.get(targetName);
    if (!targetMesh) {
      return;
    }

    const pulse = 0.5 + 0.5 * Math.sin(timeMS * 0.01);
    targetMesh.userData.highlightOutline.visible = true;
    targetMesh.userData.highlightOutline.material.opacity = 0.65 + pulse * 0.35;
  }

  applySceneInitialState({ resetData = false, rebindCameras = false } = {}) {
    if (!this.model || !this.data) {
      return;
    }
    if (resetData) {
      this.mujoco.mj_resetData(this.model, this.data);
    }

    const isPrimaryDemoScene = this.params.scene === initialScene;
    if (isPrimaryDemoScene && this.policyController) {
      this.policyController.applyInitialPose(this.model, this.data);
    }

    this.mujoco.mj_forward(this.model, this.data);
    if (rebindCameras) {
      this.bindTrackingTargets();
    }
    if (this.policyController && typeof this.policyController.reset === 'function') {
      this.policyController.reset();
    }
    this.updateObstacleHighlight(null, performance.now());
    this.obstacleWarningActive = null;
    this.obstacleWarningLastActiveTime = -Infinity;
    this.obstacleWarningTargetName = null;
    this.policyStepCounter = 0;
  }

  async initPolicy() {
    const urlParams = new URLSearchParams(window.location.search);
    const defaultPolicyPath = './php-release/student.onnx';
    const modelPath = urlParams.get('policy') || defaultPolicyPath;
    const controller = new PolicyController(this.mujoco, {
      modelPath: modelPath,
      depthModelPath: urlParams.get('depthPolicy') || modelPath.replace('student.onnx', 'depth_backbone.onnx'),
      observationLayout: urlParams.get('layout') || (modelPath === defaultPolicyPath ? 'php-release' : 'metadata'),
      wasmPaths: { wasm: ortWasmUrl, mjs: ortModuleUrl },
      depthLatencySteps: 7,
      controlDt: 0.02
    });
    try {
      await controller.init(this.model);
      this.policyController = controller;
      this.policyStepCounter = 0;
      const timestep = this.model?.opt?.timestep ?? 0.002;
      this.policyDecimation = Math.max(1, Math.round(controller.controlDt / timestep));
      this.depthDecimation = Math.max(1, Math.round(1 / (RELEASE_DEPTH.renderHz * timestep)));
      if (this.params.scene === initialScene) controller.applyInitialPose(this.model, this.data);
      console.log('Policy loaded. Decimation:', this.policyDecimation);
    } catch (error) {
      console.error('Failed to initialize policy:', error);
      this.policyController = null;
      throw error;
    }
  }

  async rebuildPolicy() {
    if (!this.policyController) {
      return;
    }
    try {
      await this.policyController.rebuild(this.model);
      this.policyStepCounter = 0;
    } catch (error) {
      console.error('Failed to rebuild policy:', error);
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize( window.innerWidth, window.innerHeight );
    this.depthInset.width = this.depthCameraConfig.width;
    this.depthInset.height = this.depthCameraConfig.height;
    this.depthTarget.setSize(this.depthCameraConfig.width, this.depthCameraConfig.height);
    this.depthInferenceTarget.setSize(this.depthCameraConfig.width, this.depthCameraConfig.height);
    this.depthCameraView.aspect = this.depthCameraConfig.width / this.depthCameraConfig.height;
    this.depthCameraView.updateProjectionMatrix();
    this.depthPixels = new Float32Array(this.depthCameraConfig.width * this.depthCameraConfig.height * 4);
    this.depthFrame = new Float32Array(this.depthCameraConfig.width * this.depthCameraConfig.height);
  }

  async render(timeMS) {
    // If the model isn't ready yet, skip rendering this frame.
    if (!this.model || !this.data) {
      return;
    }

    this.controls.update();
    if (this.resetRequested) {
      this.resetRequested = false;
      this.dragStateManager.end();
      this.policyController.pressedKeys.clear();
      this.applySceneInitialState({ resetData: true, rebindCameras: true });
      this.mujoco_time = timeMS;
    }

    if (!this.params["paused"]) {
      let timestep = this.model.opt.timestep;
      // Bound catch-up without discarding every physics step on slow devices.
      if (timeMS - this.mujoco_time > 35.0) { this.mujoco_time = timeMS - 20.0; }
      while (this.mujoco_time < timeMS) {

        // Jitter the control state with gaussian random noise
        if (this.params["ctrlnoisestd"] > 0.0) {
          let rate  = Math.exp(-timestep / Math.max(1e-10, this.params["ctrlnoiserate"]));
          let scale = this.params["ctrlnoisestd"] * Math.sqrt(1 - rate * rate);
          let currentCtrl = this.data.ctrl;
          for (let i = 0; i < currentCtrl.length; i++) {
            currentCtrl[i] = rate * currentCtrl[i] + scale * standardNormal();
            this.params["Actuator " + i] = currentCtrl[i];
          }
        }

        // Clear old perturbations, apply new ones.
        for (let i = 0; i < this.data.qfrc_applied.length; i++) { this.data.qfrc_applied[i] = 0.0; }
        let dragged = this.dragStateManager.physicsObject;
        if (dragged && dragged.bodyID) {
          for (let b = 0; b < this.model.nbody; b++) {
            if (this.bodies[b]) {
              getPosition  (this.data.xpos , b, this.bodies[b].position);
              getQuaternion(this.data.xquat, b, this.bodies[b].quaternion);
              this.bodies[b].updateWorldMatrix();
            }
          }
          let bodyID = dragged.bodyID;
          this.dragStateManager.update(); // Update the world-space force origin
          let force = toMujocoPos(this.dragStateManager.currentWorld.clone().sub(this.dragStateManager.worldHit).multiplyScalar(this.model.body_mass[bodyID] * 250));
          let point = toMujocoPos(this.dragStateManager.worldHit.clone());
          mujoco.mj_applyFT(this.model, this.data, [force.x, force.y, force.z], [0, 0, 0], [point.x, point.y, point.z], bodyID, this.data.qfrc_applied);

          // TODO: Apply pose perturbations (mocap bodies only).
        }

        if (this.policyController && this.params.policyEnabled) {
          if (this.policyStepCounter % this.depthDecimation === 0) this.captureDepthFrame();
          if (this.policyStepCounter % this.policyDecimation === 0) {
            try {
              await this.policyController.requestAction(this.model, this.data);
            } catch (error) {
              this.params.paused = true;
              throw error;
            }
          }
          this.policyController.applyControl(this.model, this.data);
          this.policyStepCounter += 1;
        }

        mujoco.mj_step(this.model, this.data);

        this.mujoco_time += timestep * 1000.0;
      }

    } else if (this.params["paused"]) {
      this.dragStateManager.update(); // Update the world-space force origin
      let dragged = this.dragStateManager.physicsObject;
      if (dragged && dragged.bodyID) {
        let b = dragged.bodyID;
        getPosition  (this.data.xpos , b, this.tmpVec , false); // Get raw coordinate from MuJoCo
        getQuaternion(this.data.xquat, b, this.tmpQuat, false); // Get raw coordinate from MuJoCo

        let offset = toMujocoPos(this.dragStateManager.currentWorld.clone()
          .sub(this.dragStateManager.worldHit).multiplyScalar(0.3));
        if (this.model.body_mocapid[b] >= 0) {
          // Set the root body's mocap position...
          console.log("Trying to move mocap body", b);
          let addr = this.model.body_mocapid[b] * 3;
          let pos  = this.data.mocap_pos;
          pos[addr+0] += offset.x;
          pos[addr+1] += offset.y;
          pos[addr+2] += offset.z;
        } else {
          // Set the root body's position directly...
          let root = this.model.body_rootid[b];
          let addr = this.model.jnt_qposadr[this.model.body_jntadr[root]];
          let pos  = this.data.qpos;
          pos[addr+0] += offset.x;
          pos[addr+1] += offset.y;
          pos[addr+2] += offset.z;
        }
      }

      mujoco.mj_forward(this.model, this.data);
    }

    this.updateObstacleWarning();

    // Update body transforms.
    for (let b = 0; b < this.model.nbody; b++) {
      if (this.bodies[b]) {
        getPosition  (this.data.xpos , b, this.bodies[b].position);
        getQuaternion(this.data.xquat, b, this.bodies[b].quaternion);
        this.bodies[b].updateWorldMatrix();
      }
    }

    if (this.pelvisBody && this.pelvisFollowOffset) {
      // Translate both camera and target; retain the user's orbit and zoom.
      const delta = this.pelvisBody.position.clone().sub(this.lastFollowPosition);
      this.camera.position.add(delta);
      this.controls.target.add(delta);
      this.lastFollowPosition.copy(this.pelvisBody.position);
      this.controls.update();
    }
    // Update light transforms.
    for (let l = 0; l < this.model.nlight; l++) {
      if (this.lights[l]) {
        getPosition(this.data.light_xpos, l, this.lights[l].position);
        getPosition(this.data.light_xdir, l, this.tmpVec);
        this.lights[l].lookAt(this.tmpVec.add(this.lights[l].position));
      }
    }

    // Draw Tendons and Flex verts
    drawTendonsAndFlex(this.mujocoRoot, this.model, this.data);
    this.depthViewMaterial.uniforms.cameraNear.value = this.depthCameraView.near;
    this.depthViewMaterial.uniforms.cameraFar.value = this.depthCameraView.far;

    // Render main view to screen.
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    this.renderer.setScissorTest(false);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    const showRawDepth = !!this.params.showRawDepth;
    if (this.policyController) {
      if (this.depthRawPixels && this.depthRawTexture && showRawDepth) {
        const minDepth = 0.3;
        const maxDepth = 3.0;
        const range = maxDepth - minDepth;
        for (let i = 0; i < this.depthFrame.length; i++) {
          const v = Number.isFinite(this.depthFrame[i]) ? this.depthFrame[i] : maxDepth;
          const norm = Math.max(0.0, Math.min(1.0, (v - minDepth) / range));
          const c = Math.round(norm * 255);
          const base = i * 4;
          this.depthRawPixels[base] = c;
          this.depthRawPixels[base + 1] = c;
          this.depthRawPixels[base + 2] = c;
          this.depthRawPixels[base + 3] = 255;
        }
        this.depthRawTexture.needsUpdate = true;
      }
    }

    if (this.policyController?.getProcessedDepthPreview) {
      const preview = this.policyController.getProcessedDepthPreview();
      if (preview) {
        const { data, width, height } = preview;
        if (width !== this.depthPreviewSize.width || height !== this.depthPreviewSize.height) {
          this.depthPreviewSize = { width, height };
          this.depthProcessedInset.width = width;
          this.depthProcessedInset.height = height;
          this.depthPreviewPixels = new Uint8Array(width * height * 4);
          this.depthPreviewTexture.dispose();
          this.depthPreviewTexture = new THREE.DataTexture(
            this.depthPreviewPixels,
            width,
            height,
            THREE.RGBAFormat
          );
          this.depthPreviewTexture.flipY = true; // The processed policy image is top-down.
          this.depthPreviewTexture.minFilter = THREE.NearestFilter;
          this.depthPreviewTexture.magFilter = THREE.NearestFilter;
          this.depthPreviewMaterial.map = this.depthPreviewTexture;
          this.depthPreviewMaterial.needsUpdate = true;
        }
        const pixelCount = width * height;
        const minDepth = 0.3;
        const maxDepth = 3.0;
        const range = maxDepth - minDepth;     
  
        for (let i = 0; i < pixelCount; i++) {
          // const v = Math.max(0, Math.min(1, data[i] + 0.5));

          let v = Number.isFinite(data[i]) ? (data[i] + 0.5) : 0.0;
          v = Math.max(0.0, Math.min(1.0, v));
          const c = Math.round(v * 255);
          const base = i * 4;
          this.depthPreviewPixels[base] = c;
          this.depthPreviewPixels[base + 1] = c;
          this.depthPreviewPixels[base + 2] = c;
          this.depthPreviewPixels[base + 3] = 255;
        }
        this.depthPreviewTexture.needsUpdate = true;
      }
    }

    this.updateInterface?.(timeMS);
    if (!this.showDepthPreview) return;

    // Visualize raw + processed depth in small inset viewports.
    this.renderer.setScissorTest(true);
    const rawX = this.depthInset.margin;
    const rawY = Math.max(140, window.innerHeight - 210);
    const rawW = this.depthInset.width * this.depthInset.previewScale;
    const rawH = this.depthInset.height * this.depthInset.previewScale;
    if (showRawDepth) {
      this.renderer.setViewport(rawX, rawY, rawW, rawH);
      this.renderer.setScissor(rawX, rawY, rawW, rawH);
      this.renderer.render(this.depthRawScene, this.depthCamera);
    }

    const processedX = showRawDepth ? (rawX + rawW + this.depthProcessedInset.gap) : rawX;
    const processedY = rawY;
    const processedW = this.depthProcessedInset.width * this.depthProcessedInset.scale;
    const processedH = this.depthProcessedInset.height * this.depthProcessedInset.scale;
    this.renderer.setViewport(processedX, processedY, processedW, processedH);
    this.renderer.setScissor(processedX, processedY, processedW, processedH);
    this.renderer.render(this.depthProcessedScene, this.depthCamera);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  }
}

let demo = new MuJoCoDemo();
await demo.init();
// Explicit diagnostics for automated verification; absent on normal URLs.
if (new URLSearchParams(location.search).get('debug') === '1') { window.parkourDemo = demo; window.parkourMaterialTypes = { Physical: THREE.MeshPhysicalMaterial, Lambert: THREE.MeshLambertMaterial }; }
