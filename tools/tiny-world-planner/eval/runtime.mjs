import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import * as ort from 'onnxruntime-web';
import {WorldModel} from '../../../assets/interactive/tiny-world-planner/src/model.js';
const directory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../assets/interactive/tiny-world-planner/models');
export async function loadModel(){const m=new WorldModel(ort,import.meta.url);ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;for(const n of ['object_encoder','agent_encoder','latent_dynamics','diagnostic_decoder'])m[n]=await ort.InferenceSession.create(new Uint8Array(fs.readFileSync(path.join(directory,n+'.onnx'))),{executionProviders:['wasm']});m.metadata=JSON.parse(fs.readFileSync(path.join(directory,'model_metadata.json')));return m;}
