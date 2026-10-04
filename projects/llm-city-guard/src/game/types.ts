export type Emotion = 'neutral' | 'amused' | 'suspicious' | 'annoyed' | 'angry' | 'surprised';
export type NpcAction = 'continue' | 'admit' | 'reject' | 'arrest';
export type Ending = 'admitted' | 'rejected' | 'arrested' | 'timeout';

export interface GameState {
  trust: number;
  suspicion: number;
  patience: number;
  timeRemaining: number;
  turn: number;
  ending: Ending | null;
}

export interface ConversationEntry {
  speaker: 'player' | 'npc';
  text: string;
}

export interface NpcTurnInput {
  state: GameState;
  playerText: string;
  history: ConversationEntry[];
}

export interface NpcTurnResult {
  reply: string;
  emotion: Emotion;
  trustDelta: number;
  suspicionDelta: number;
  patienceDelta: number;
  action: NpcAction;
}

export interface NpcModel {
  load(): Promise<void>;
  generateTurn(input: NpcTurnInput): Promise<NpcTurnResult>;
  dispose(): Promise<void>;
}
