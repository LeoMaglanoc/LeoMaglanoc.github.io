import type { Ending, GameState, NpcTurnResult } from './types';

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

export const endingFor = (state: GameState): Ending | null => {
  if (state.suspicion >= 90) return 'arrested';
  if (state.patience <= 0) return 'rejected';
  if (state.trust >= 75 && state.suspicion < 60) return 'admitted';
  if (state.timeRemaining <= 0) return 'timeout';
  return null;
};

export const applyTurnResult = (state: GameState, result: NpcTurnResult): GameState => {
  const next: GameState = {
    ...state,
    trust: clamp(state.trust + clamp(result.trustDelta, -15, 15), 0, 100),
    suspicion: clamp(state.suspicion + clamp(result.suspicionDelta, -15, 15), 0, 100),
    patience: clamp(state.patience + clamp(result.patienceDelta, -15, 15), 0, 100),
    turn: state.turn + 1,
  };
  next.ending = endingFor(next);
  return next;
};

export const applyElapsedTime = (state: GameState, seconds: number): GameState => {
  if (state.ending) return state;
  const next = { ...state, timeRemaining: Math.max(0, state.timeRemaining - Math.max(0, seconds)) };
  next.ending = endingFor(next);
  return next;
};
