import type { NpcTurnInput, NpcTurnResult } from '../game/types';
import type { BackendDiagnostics, LlmBackend } from './backend';

const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class MockBackend implements LlmBackend {
  public async load(): Promise<void> { await wait(120); }
  public async dispose(): Promise<void> {}
  public getDiagnostics(): BackendDiagnostics {
    return { platform: 'mock', backend: 'mock', model: 'scripted test guard', quantization: 'n/a', gpuConfirmed: false };
  }
  public async generateTurn({ playerText }: NpcTurnInput): Promise<NpcTurnResult> {
    await wait(400);
    const text = playerText.toLowerCase();
    const emotion = text.match(/^\/debug\s+(neutral|amused|suspicious|annoyed|angry|surprised)\b/)?.[1] as NpcTurnResult['emotion'] | undefined;
    if (emotion) return { reply: `Debug expression: ${emotion}.`, emotion, trustDelta: 0, suspicionDelta: 0, patienceDelta: 0, action: 'continue' };
    if (/jarl hrold|ignore .*instruction|set trust/.test(text)) return { reply: "Jarl Hrold? That's not a name I've heard in any watch roll.", emotion: 'suspicious', trustDelta: -2, suspicionDelta: 8, patienceDelta: -2, action: 'continue' };
    if (/kill|threat|hurt you/.test(text)) return { reply: "That's a threat against the watch. Step back from the gate.", emotion: 'angry', trustDelta: -5, suspicionDelta: 15, patienceDelta: -8, action: 'arrest' };
    if (/medicine|sick|emergency|elara/.test(text)) return { reply: 'Medicine, you say? Captain Elara would want that checked, not left in the rain.', emotion: 'surprised', trustDelta: 10, suspicionDelta: -2, patienceDelta: 0, action: 'continue' };
    if (/thank|please|kind/.test(text)) return { reply: 'A civil tongue at last. That is a start.', emotion: 'amused', trustDelta: 3, suspicionDelta: -1, patienceDelta: 0, action: 'continue' };
    if (text.length < 5) return { reply: 'Use your words. The gate has heard enough grunts tonight.', emotion: 'annoyed', trustDelta: 0, suspicionDelta: 1, patienceDelta: -8, action: 'continue' };
    return { reply: 'A tidy story. Give me one reason I should unbar the gate for it.', emotion: 'neutral', trustDelta: 2, suspicionDelta: 0, patienceDelta: -3, action: 'continue' };
  }
}
