/// <reference lib="webworker" />
import { AutoProcessor, Gemma4ForConditionalGeneration, env } from '@huggingface/transformers';
import type { NpcTurnInput } from '../../game/types';
import { buildPrompt } from '../../game/prompt';
import { MODEL_CONFIG } from '../config';
import { FALLBACK_TURN, parseTurn } from '../parser';
import type { BackendDiagnostics } from '../backend';

type WebGpuNavigator = Navigator & { gpu?: { requestAdapter(): Promise<{ info?: { description?: string; vendor?: string; architecture?: string } } | null> } };

let processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null;
let model: Awaited<ReturnType<typeof Gemma4ForConditionalGeneration.from_pretrained>> | null = null;
let loading: Promise<void> | null = null;
let diagnostics: BackendDiagnostics = { platform: 'web', backend: 'webgpu', model: MODEL_CONFIG.id, quantization: MODEL_CONFIG.dtype, gpuConfirmed: false };

const send = (message: unknown): void => self.postMessage(message);

const load = async (): Promise<void> => {
  if (loading) return loading;
  loading = (async () => {
    const gpu = (self.navigator as WebGpuNavigator).gpu;
    if (!gpu) throw new Error('This browser cannot provide a compatible WebGPU adapter.');
    const adapter = await gpu.requestAdapter();
    if (!adapter) throw new Error('This browser cannot provide a compatible WebGPU adapter.');
    const started = performance.now();
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = `${import.meta.env.BASE_URL}models/`;
    env.useBrowserCache = true;
    const progress_callback = (progress: { progress?: number; loaded?: number; total?: number; status?: string }) =>
      send({ type: 'MODEL_PROGRESS', progress: progress.progress ?? 0, loaded: progress.loaded, total: progress.total, status: progress.status });
    processor = await AutoProcessor.from_pretrained(MODEL_CONFIG.localId, { progress_callback });
    model = await Gemma4ForConditionalGeneration.from_pretrained(MODEL_CONFIG.localId, {
      dtype: MODEL_CONFIG.dtype, device: 'webgpu', progress_callback,
    });
    const info = adapter.info;
    diagnostics = {
      ...diagnostics,
      gpuConfirmed: true,
      gpuName: info?.description || [info?.vendor, info?.architecture].filter(Boolean).join(' / ') || undefined,
      loadMs: Math.round(performance.now() - started),
    };
  })();
  try { await loading; } catch (error) { loading = null; throw error; }
};

const generateText = async (prompt: string): Promise<{ text: string; firstTokenMs: number; generationMs: number; tokens: number }> => {
  if (!processor || !model) throw new Error('Model was not loaded.');
  const started = performance.now();
  const chat = processor.apply_chat_template([{ role: 'user', content: [{ type: 'text', text: prompt }] }], { add_generation_prompt: true });
  const inputs = await processor(chat);
  const firstTokenMs = performance.now() - started;
  const output = await model.generate({ ...inputs, max_new_tokens: MODEL_CONFIG.maxNewTokens, do_sample: false, use_cache: true });
  const ids = Array.from((output as unknown as Array<Iterable<number>>)[0]);
  const inputIds = Array.from((inputs.input_ids as unknown as Array<Iterable<number>>)[0]);
  return { text: processor.decode(ids.slice(inputIds.length), { skip_special_tokens: true }), firstTokenMs, generationMs: performance.now() - started, tokens: ids.length - inputIds.length };
};

const generate = async (input: NpcTurnInput) => {
  const first = await generateText(buildPrompt(input));
  let result = parseTurn(first.text);
  let measurements = first;
  if (!result) {
    const repair = await generateText(`Return only valid JSON for this schema. ${first.text}\n{"reply":"...","emotion":"neutral","trustDelta":0,"suspicionDelta":0,"patienceDelta":0,"action":"continue"}`);
    result = parseTurn(repair.text);
    measurements = repair;
  }
  diagnostics = { ...diagnostics, firstTokenMs: Math.round(measurements.firstTokenMs), generationMs: Math.round(measurements.generationMs), tokens: measurements.tokens, tokensPerSecond: measurements.tokens ? Number((measurements.tokens / (measurements.generationMs / 1000)).toFixed(2)) : 0 };
  return result ?? FALLBACK_TURN;
};

self.onmessage = async ({ data }: MessageEvent<{ type: string; id?: number; input?: NpcTurnInput }>) => {
  try {
    if (data.type === 'LOAD_MODEL') { await load(); send({ type: 'MODEL_READY', diagnostics }); return; }
    if (data.type === 'GENERATE' && data.id !== undefined && data.input) { await load(); send({ type: 'RESULT', id: data.id, result: await generate(data.input), diagnostics }); }
  } catch (error) { send({ type: 'ERROR', id: data.id, error: error instanceof Error ? error.message : String(error), diagnostics }); }
};
