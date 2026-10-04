import { describe, expect, it } from 'vitest';
import { FALLBACK_TURN, parseTurn } from '../../src/llm/parser';

describe('turn parser', () => {
  it('extracts a JSON object surrounded by model prose', () => expect(parseTurn('Here: {"reply":"No.","emotion":"suspicious","trustDelta":0,"suspicionDelta":2,"patienceDelta":-1,"action":"continue"}')).toMatchObject({ reply: 'No.' }));
  it('rejects malformed output for fallback handling', () => expect(parseTurn('{ definitely not JSON')).toBeNull());
  it('has a safe deterministic fallback', () => expect(FALLBACK_TURN.action).toBe('continue'));
});
