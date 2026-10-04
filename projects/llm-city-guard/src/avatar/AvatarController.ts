import type { VRM } from '@pixiv/three-vrm';
import type { Emotion } from '../game/types';
import { AnimationController } from './animationController';
import { BlinkController } from './blinkController';
import { emotionToPose } from './emotionMap';
import { GazeController } from './gazeController';
import type { AvatarLifecycle, AvatarState } from './types';

export class AvatarController {
  private readonly animation = new AnimationController();
  private readonly blink: BlinkController;
  private readonly gaze = new GazeController();
  private state: AvatarState = { emotion: 'neutral', lifecycle: 'idle' };

  public constructor(private readonly vrm: VRM, deterministic = false) { this.blink = new BlinkController(deterministic); }

  public setEmotion(emotion: Emotion): void { this.state.emotion = emotion; }
  public setLifecycle(lifecycle: AvatarLifecycle): void { this.state.lifecycle = lifecycle; }

  public update(delta: number, elapsed: number): void {
    const pose = this.state.lifecycle === 'thinking'
      ? { ...emotionToPose[this.state.emotion], gesture: 'thinking' as const }
      : this.state.lifecycle === 'listening'
        ? { ...emotionToPose[this.state.emotion], gesture: 'nod' as const }
        : emotionToPose[this.state.emotion];
    this.animation.setPose(pose);
    this.gaze.setThinking(this.state.lifecycle === 'thinking', elapsed);
    this.vrm.lookAt?.lookAt(this.gaze.update(delta));
    const expressions = this.vrm.expressionManager;
    if (expressions) {
      expressions.setValue('happy', pose.expression === 'happy' ? pose.expressionWeight : 0);
      expressions.setValue('angry', pose.expression === 'angry' ? pose.expressionWeight : 0);
      expressions.setValue('surprised', pose.expression === 'surprised' ? pose.expressionWeight : 0);
      expressions.setValue('blink', this.blink.update(delta));
    }
    this.vrm.update(delta);
    this.animation.update(this.vrm, elapsed, delta);
  }
}
