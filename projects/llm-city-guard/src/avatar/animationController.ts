import type { VRM } from '@pixiv/three-vrm';
import type { AvatarPose } from './types';

/**
 * A deliberately tiny procedural gesture layer. It gives the stationary guard
 * readable body language without importing a general-purpose animation graph.
 */
export class AnimationController {
  private pose: AvatarPose = { expression: 'neutral', expressionWeight: 0, gesture: 'idle' };

  public setPose(pose: AvatarPose): void { this.pose = pose; }

  public update(vrm: VRM, elapsed: number, delta: number): void {
    const upperChest = vrm.humanoid.getNormalizedBoneNode('upperChest');
    const neck = vrm.humanoid.getNormalizedBoneNode('neck');
    const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
    const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
    const breath = Math.sin(elapsed * 1.55) * 0.025;
    let neckYaw = Math.sin(elapsed * 0.35) * 0.025;
    let neckPitch = breath;
    let armLift = 0;

    if (this.pose.gesture === 'thinking') {
      neckYaw += Math.sin(elapsed * 1.1) * 0.12;
      neckPitch -= 0.08;
      armLift = 0.18;
    } else if (this.pose.gesture === 'happy') {
      neckPitch = -0.04 + Math.sin(elapsed * 2.4) * 0.035;
      armLift = 0.16 + Math.sin(elapsed * 2.4) * 0.06;
    } else if (this.pose.gesture === 'angry') {
      neckPitch = 0.11;
      armLift = 0.1;
    } else if (this.pose.gesture === 'shake') {
      neckYaw += Math.sin(elapsed * 7) * 0.2;
    }

    const blend = 1 - Math.exp(-delta * 6);
    if (upperChest) upperChest.rotation.x += (breath - upperChest.rotation.x) * blend;
    if (neck) {
      neck.rotation.x += (neckPitch - neck.rotation.x) * blend;
      neck.rotation.y += (neckYaw - neck.rotation.y) * blend;
    }
    if (leftUpperArm) leftUpperArm.rotation.z += ((-0.1 - armLift) - leftUpperArm.rotation.z) * blend;
    if (rightUpperArm) rightUpperArm.rotation.z += ((0.1 + armLift) - rightUpperArm.rotation.z) * blend;
  }
}
