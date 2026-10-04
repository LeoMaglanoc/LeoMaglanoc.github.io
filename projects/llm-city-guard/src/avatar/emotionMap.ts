import type { Emotion } from '../game/types';
import type { AvatarPose } from './types';

export const emotionToPose: Record<Emotion, AvatarPose> = {
  neutral: { expression: 'neutral', expressionWeight: 0, gesture: 'idle' },
  amused: { expression: 'happy', expressionWeight: 0.72, gesture: 'happy' },
  suspicious: { expression: 'angry', expressionWeight: 0.2, gesture: 'thinking' },
  annoyed: { expression: 'angry', expressionWeight: 0.45, gesture: 'shake' },
  angry: { expression: 'angry', expressionWeight: 0.85, gesture: 'angry' },
  surprised: { expression: 'surprised', expressionWeight: 0.8, gesture: 'thinking' },
};
