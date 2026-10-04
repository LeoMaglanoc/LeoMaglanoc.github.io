import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../src/game/engine';
import { applyElapsedTime, applyTurnResult, endingFor } from '../../src/game/rules';
import { createInitialState } from '../../src/game/state';
import type { NpcModel, NpcTurnInput, NpcTurnResult } from '../../src/game/types';

const result = (overrides: Partial<NpcTurnResult> = {}): NpcTurnResult => ({ reply: 'Hm.', emotion: 'neutral', trustDelta: 0, suspicionDelta: 0, patienceDelta: 0, action: 'continue', ...overrides });
const model: NpcModel = { load: async () => {}, dispose: async () => {}, generateTurn: async (_input: NpcTurnInput) => result() };

describe('rules', () => {
  it('initializes expected state', () => expect(createInitialState()).toMatchObject({ trust: 25, suspicion: 15, patience: 80, timeRemaining: 120, turn: 0, ending: null }));
  it('clamps malicious or invalid deltas', () => {
    const next = applyTurnResult(createInitialState(), result({ trustDelta: 999, suspicionDelta: Number.NaN, patienceDelta: -999 }));
    expect(next).toMatchObject({ trust: 40, suspicion: 15, patience: 65 });
  });
  it('trust causes admission only below suspicion threshold', () => expect(endingFor({ ...createInitialState(), trust: 75, suspicion: 59 })).toBe('admitted'));
  it('arrest takes precedence over every other result', () => expect(endingFor({ ...createInitialState(), trust: 100, suspicion: 90 })).toBe('arrested'));
  it('rejects at zero patience', () => expect(endingFor({ ...createInitialState(), patience: 0 })).toBe('rejected'));
  it('times out', () => expect(applyElapsedTime({ ...createInitialState(), timeRemaining: 1 }, 1).ending).toBe('timeout'));
  it('does not allow advisory LLM action to override rules', () => expect(applyTurnResult(createInitialState(), result({ action: 'admit' })).ending).toBeNull());
});

describe('engine', () => {
  it('restarts cleanly', async () => { const engine = new GameEngine(model); await engine.submit('Hello'); engine.restart(); expect(engine.state).toEqual(createInitialState()); expect(engine.history).toHaveLength(1); });
});
