import { SYSTEM_PROMPT } from './systemPrompt';
import type { NpcTurnInput } from './types';

export const buildPrompt = ({ state, playerText, history }: NpcTurnInput): string => {
  const recent = history.slice(-8).map((line) => `${line.speaker === 'player' ? 'PLAYER' : 'RURIK'}: ${line.text}`).join('\n');
  return `${SYSTEM_PROMPT}\n\nCURRENT STATE\ntrust=${state.trust}\nsuspicion=${state.suspicion}\npatience=${state.patience}\n\nRECENT CONVERSATION\n${recent || '(none)'}\n\nPLAYER\n${playerText}\n\nRURIK`;
};
