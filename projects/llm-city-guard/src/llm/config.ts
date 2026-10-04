export interface ModelConfig {
  id: string;
  revision: string;
  localId: string;
  dtype: 'q4f16';
  maxNewTokens: number;
}

export const MODEL_CONFIG: ModelConfig = {
  id: 'onnx-community/gemma-4-E2B-it-ONNX',
  revision: '9f4bef82ea6e296bc69f8a2f5939f73af81b07a6',
  localId: 'gemma-4-e2b-it-onnx',
  dtype: 'q4f16',
  maxNewTokens: 32,
};
