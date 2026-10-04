import { applyElapsedTime, applyTurnResult } from './rules';
import { createInitialState } from './state';
import type { ConversationEntry, GameState, NpcModel, NpcTurnResult } from './types';

export class GameEngine {
  private gameState = createInitialState();
  private conversation: ConversationEntry[] = [{ speaker: 'npc', text: "Gate's closed. Come back at sunrise." }];

  public constructor(private readonly model: NpcModel) {}

  public get state(): Readonly<GameState> { return this.gameState; }
  public get history(): readonly ConversationEntry[] { return this.conversation; }

  public async submit(playerText: string): Promise<NpcTurnResult> {
    if (this.gameState.ending) throw new Error('The game has already ended.');
    const text = playerText.trim();
    if (!text) throw new Error('Say something first.');
    this.conversation.push({ speaker: 'player', text });
    const result = await this.model.generateTurn({ state: this.gameState, playerText: text, history: this.conversation.slice(-8) });
    this.gameState = applyTurnResult(this.gameState, result);
    this.conversation.push({ speaker: 'npc', text: result.reply });
    this.conversation = this.conversation.slice(-8);
    return result;
  }

  public tick(seconds = 1): void { this.gameState = applyElapsedTime(this.gameState, seconds); }
  public restart(): void {
    this.gameState = createInitialState();
    this.conversation = [{ speaker: 'npc', text: "Gate's closed. Come back at sunrise." }];
  }
}
