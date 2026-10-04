import type { NpcTurnInput, NpcTurnResult } from '../game/types';

export interface BackendDiagnostics {
  platform: 'web' | 'android' | 'mock';
  backend: 'webgpu' | 'vulkan' | 'mock';
  model: string;
  quantization: string;
  gpuName?: string;
  loadMs?: number;
  firstTokenMs?: number;
  generationMs?: number;
  tokens?: number;
  tokensPerSecond?: number;
  gpuConfirmed: boolean;
  failure?: string;
}

export interface LlmBackend {
  load(): Promise<void>;
  generateTurn(input: NpcTurnInput): Promise<NpcTurnResult>;
  getDiagnostics(): BackendDiagnostics;
  dispose(): Promise<void>;
}
