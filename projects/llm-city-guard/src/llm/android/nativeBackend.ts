import { Capacitor, registerPlugin } from '@capacitor/core';
import type { NpcTurnInput, NpcTurnResult } from '../../game/types';
import { buildPrompt } from '../../game/prompt';
import { FALLBACK_TURN, parseTurn } from '../parser';
import type { BackendDiagnostics, LlmBackend } from '../backend';

interface NativeLlmPlugin {
  loadModel(options: { path: string }): Promise<BackendDiagnostics>;
  generate(options: { prompt: string; maxTokens: number }): Promise<{ text: string; tokens: number; firstTokenMs: number; generationMs: number; tokensPerSecond: number }>;
  unload(): Promise<void>;
  markDeviceTestPassed(): Promise<void>;
  isDeviceTestLaunch(): Promise<{ deviceTest: boolean }>;
  isModelDownloadLaunch(): Promise<{ downloadModel: boolean }>;
  downloadAcceptanceModel(): Promise<{ path: string; sha256: string }>;
}

const NativeLlm = registerPlugin<NativeLlmPlugin>('NativeLlm');

export const isNativeAndroid = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export class NativeAndroidBackend implements LlmBackend {
  private diagnostics: BackendDiagnostics = { platform: 'android', backend: 'vulkan', model: 'Gemma 4 E2B', quantization: 'Q4_K_M', gpuConfirmed: false };

  public constructor(private readonly modelPath: string) {}
  public getDiagnostics(): BackendDiagnostics { return this.diagnostics; }

  public async load(): Promise<void> {
    if (!isNativeAndroid()) throw new Error('The Vulkan backend is available only in the Android Capacitor app.');
    this.diagnostics = await NativeLlm.loadModel({ path: this.modelPath });
    if (!this.diagnostics.gpuConfirmed || this.diagnostics.backend !== 'vulkan') throw new Error('Vulkan acceleration was not confirmed; refusing CPU fallback.');
  }

  public async generateTurn(input: NpcTurnInput): Promise<NpcTurnResult> {
    return parseTurn(await this.generateRawTurn(input)) ?? FALLBACK_TURN;
  }

  /** Raw generation is intentionally exposed only for physical-device acceptance. */
  public async generateRawTurn(input: NpcTurnInput): Promise<string> {
    const output = await NativeLlm.generate({ prompt: buildPrompt(input), maxTokens: 32 });
    this.diagnostics = { ...this.diagnostics, tokens: output.tokens, firstTokenMs: output.firstTokenMs, generationMs: output.generationMs, tokensPerSecond: output.tokensPerSecond };
    return output.text;
  }

  public async dispose(): Promise<void> { await NativeLlm.unload(); }
  public async markDeviceTestPassed(): Promise<void> { await NativeLlm.markDeviceTestPassed(); }
  public async isDeviceTestLaunch(): Promise<boolean> { return (await NativeLlm.isDeviceTestLaunch()).deviceTest; }
  public async isModelDownloadLaunch(): Promise<boolean> { return (await NativeLlm.isModelDownloadLaunch()).downloadModel; }
  public async downloadAcceptanceModel(): Promise<void> { await NativeLlm.downloadAcceptanceModel(); }
}
