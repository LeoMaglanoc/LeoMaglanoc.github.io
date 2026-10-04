import type { NpcTurnInput, NpcTurnResult } from '../../game/types';
import type { BackendDiagnostics, LlmBackend } from '../backend';
import type { ModelConfig } from '../config';

type WorkerEvent =
  | { type: 'MODEL_PROGRESS'; progress: number; loaded?: number; total?: number; status?: string }
  | { type: 'MODEL_READY'; diagnostics: BackendDiagnostics }
  | { type: 'RESULT'; id: number; result: NpcTurnResult; diagnostics: BackendDiagnostics }
  | { type: 'ERROR'; id?: number; error: string; diagnostics?: BackendDiagnostics };

type WebGpuNavigator = Navigator & { gpu?: { requestAdapter(): Promise<unknown> } };

export const hasWebGpu = (): boolean => 'gpu' in navigator && Boolean((navigator as WebGpuNavigator).gpu);
export const hasWebGpuAdapter = async (): Promise<boolean> => {
  const adapter = await (navigator as WebGpuNavigator).gpu?.requestAdapter();
  return Boolean(adapter);
};

export class WebGpuBackend implements LlmBackend {
  private readonly worker = new Worker(new URL('./webGpu.worker.ts', import.meta.url), { type: 'module' });
  private sequence = 0;
  private readonly waiting = new Map<number, { resolve: (value: NpcTurnResult) => void; reject: (reason: Error) => void }>();
  private loadPromise: Promise<void> | null = null;
  private diagnostics: BackendDiagnostics;
  public onProgress?: (event: Extract<WorkerEvent, { type: 'MODEL_PROGRESS' }>) => void;

  public constructor(config: ModelConfig) {
    this.diagnostics = { platform: 'web', backend: 'webgpu', model: config.id, quantization: config.dtype, gpuConfirmed: false };
    this.worker.onmessage = ({ data }: MessageEvent<WorkerEvent>) => this.onMessage(data);
    this.worker.onerror = (event) => this.rejectAll(event.message);
  }

  public getDiagnostics(): BackendDiagnostics { return this.diagnostics; }

  public load(): Promise<void> {
    if (!hasWebGpu()) return Promise.reject(new Error('This browser cannot provide a compatible WebGPU adapter.'));
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = new Promise((resolve, reject) => {
      const ready = (event: MessageEvent<WorkerEvent>) => {
        if (event.data.type === 'MODEL_READY') { this.worker.removeEventListener('message', ready); this.diagnostics = event.data.diagnostics; resolve(); }
        if (event.data.type === 'ERROR' && event.data.id === undefined) { this.worker.removeEventListener('message', ready); reject(new Error(event.data.error)); }
      };
      this.worker.addEventListener('message', ready);
      this.worker.postMessage({ type: 'LOAD_MODEL' });
    });
    return this.loadPromise;
  }

  public generateTurn(input: NpcTurnInput): Promise<NpcTurnResult> {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => { this.waiting.set(id, { resolve, reject }); this.worker.postMessage({ type: 'GENERATE', id, input }); });
  }

  public async dispose(): Promise<void> { this.rejectAll('Model disposed'); this.worker.terminate(); }

  private onMessage(event: WorkerEvent): void {
    if (event.type === 'MODEL_PROGRESS') { this.onProgress?.(event); return; }
    if (event.type === 'MODEL_READY') { this.diagnostics = event.diagnostics; return; }
    if (event.type === 'RESULT') { this.diagnostics = event.diagnostics; const entry = this.waiting.get(event.id); this.waiting.delete(event.id); entry?.resolve(event.result); return; }
    if (event.type === 'ERROR') { if (event.diagnostics) this.diagnostics = event.diagnostics; if (event.id) { const entry = this.waiting.get(event.id); this.waiting.delete(event.id); entry?.reject(new Error(event.error)); } }
  }

  private rejectAll(message: string): void { for (const entry of this.waiting.values()) entry.reject(new Error(message)); this.waiting.clear(); }
}
