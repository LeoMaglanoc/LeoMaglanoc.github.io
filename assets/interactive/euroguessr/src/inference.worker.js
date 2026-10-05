/* Coordinates and round IDs are never sent to this worker. */
importScripts("../vendor/ort.min.js");
let session, metadata, references, predict;
let loadingBytes=0,loadMode="tiny";
async function modelBytes(url, info, total) {
  let cache; try { cache=await caches.open("euroguessr-models-v2"); } catch {}
  const key=new URL(url);
  if(info.sha256) key.searchParams.set("sha256",info.sha256);
  let response=cache ? await cache.match(key.href) : null;
  let cached=!!response;
  if (!response) { response=await fetch(key.href); if(!response.ok)throw Error(`Cannot download model (${response.status})`); }
  let bytes=new Uint8Array(await response.arrayBuffer());
  if (info.sha256) {
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(v=>v.toString(16).padStart(2,"0")).join("");
    if(hash!==info.sha256) { if(cache)await cache.delete(key.href); throw Error("Model checksum failed. Retry the download."); }
  }
  if(cache && !cached) { try { await cache.put(key.href,new Response(bytes)); } catch {} }
  loadingBytes+=bytes.length;postMessage({type:"progress",bytes:loadingBytes,total,cached,mode:loadMode});
  return bytes;
}
async function checkedFetch(url) {
  const response=await fetch(url);
  if(!response.ok)throw Error(`Cannot download asset (${response.status})`);
  return response;
}
async function json(url,sha) {
  const key=new URL(url,self.location.href);if(sha)key.searchParams.set("sha256",sha);
  const response = await fetch(key.href);
  if (!response.ok) throw Error(`Could not load ${url}: ${response.status}`);
  const bytes=await response.arrayBuffer();
  if(sha) {
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(v=>v.toString(16).padStart(2,"0")).join("");
    if(hash!==sha)throw Error("Reference metadata checksum failed. Retry the download.");
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = new URL("../vendor/", self.location.href).href;
      const mod = await import("./geo.js");
      predict = mod.selectPrediction;
      if (session) { await session.release(); session=null; }
      references=null; loadingBytes=0;loadMode=data.mode||"tiny";
      const folder = data.mode === "geoclip" ? "../models/geoclip/" : "../models/";
      metadata = await json(`${folder}metadata.json`);
      references = metadata.method === "head" ? null : await json(`${folder}references.json`,metadata.reference_metadata_sha256);
      const total=metadata.download_bytes||metadata.onnx_bytes+metadata.reference_bytes;
      if (references?.feature_file) {
        const url = new URL(`${folder}${references.feature_file}`, self.location.href).href;
        const refInfo=metadata.files?.find(f=>f.path===references.feature_file)||{sha256:metadata.reference_sha256};
        const bytes=refInfo.sha256 ? await modelBytes(url,refInfo,total) : new Uint8Array(await (await checkedFetch(url)).arrayBuffer());
        const buffer=bytes.buffer;
        if (buffer.byteLength !== references.count * references.dimensions * 4) throw Error("Invalid visual reference file");
        references.features = Array.from(
          { length: references.count },
          (_, i) => new Float32Array(buffer, i * references.dimensions * 4, references.dimensions)
        );
      }
      const options={executionProviders:["wasm"]};
      let source=new URL(`${folder}model.onnx`,self.location.href).href;
      if(!metadata.external_data && metadata.model_sha256)source=await modelBytes(source,{sha256:metadata.model_sha256},total);
      if(metadata.external_data) {
        source=await modelBytes(source,metadata.files.find(f=>f.path==="model.onnx"),metadata.download_bytes);
        options.externalData=[];
        for(const info of metadata.external_data) {
          const bytes=await modelBytes(new URL(`${folder}${info.path}`,self.location.href).href,info,metadata.download_bytes);
          options.externalData.push({path:info.path,data:bytes});
        }
        postMessage({type:"progress",bytes:loadingBytes,total:metadata.download_bytes,initializing:true});
      }
      session = await ort.InferenceSession.create(source, options);
      postMessage({ type: "ready", metadata, mode:data.mode||"tiny" });
    } else if (data.type === "predict") {
      if (!session) throw Error("AI is not initialized");
      const start = performance.now();
      const input = new ort.Tensor("float32", data.pixels, [1, 3, 224, 224]);
      const out = await session.run({ image: input });
      const location = predict(Array.from(out[metadata.embedding_output || "embedding"].data), Array.from(out.logits?.data || []), metadata, references);
      if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon)) throw Error("AI produced an invalid coordinate");
      input.dispose();
      Object.values(out).forEach((t) => t.dispose());
      postMessage({ type: "prediction", token: data.token, location, milliseconds: performance.now() - start });
    }
  } catch (error) {
    postMessage({ type: "error", message: error.message, token: data.token });
  }
};
