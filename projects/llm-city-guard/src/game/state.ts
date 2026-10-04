import type { GameState } from './types';

export const INITIAL_STATE: Readonly<GameState> = {
  trust: 25,
  suspicion: 15,
  patience: 80,
  timeRemaining: 120,
  turn: 0,
  ending: null,
};

export const createInitialState = (): GameState => ({ ...INITIAL_STATE });
