import type { Emotion } from '../game/types';

export type AvatarLifecycle = 'idle' | 'listening' | 'thinking' | 'result';

export interface AvatarPose {
  expression: 'neutral' | 'happy' | 'angry' | 'surprised';
  expressionWeight: number;
  gesture: 'idle' | 'thinking' | 'happy' | 'angry' | 'nod' | 'shake';
}

export interface AvatarState {
  emotion: Emotion;
  lifecycle: AvatarLifecycle;
}
