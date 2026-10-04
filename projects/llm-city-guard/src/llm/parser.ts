import { z } from 'zod';
import type { NpcTurnResult } from '../game/types';

const turnSchema = z.object({
  reply: z.string().trim().min(1).max(500),
  emotion: z.enum(['neutral', 'amused', 'suspicious', 'annoyed', 'angry', 'surprised']),
  trustDelta: z.number().finite(),
  suspicionDelta: z.number().finite(),
  patienceDelta: z.number().finite(),
  action: z.enum(['continue', 'admit', 'reject', 'arrest']),
});

export const FALLBACK_TURN: NpcTurnResult = {
  reply: "You're not making much sense. Try that again.",
  emotion: 'suspicious', trustDelta: 0, suspicionDelta: 2, patienceDelta: -3, action: 'continue',
};

const objectFrom = (text: string): unknown => {
  try { return JSON.parse(text); } catch { /* try the first braced JSON object */ }
  const start = text.indexOf('{');
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) {
      try { return JSON.parse(text.slice(start, index + 1)); } catch { return undefined; }
    }
  }
  return undefined;
};

export const parseTurn = (text: string): NpcTurnResult | null => {
  const result = turnSchema.safeParse(objectFrom(text));
  return result.success ? result.data : null;
};
