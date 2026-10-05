/* Developer-only backend audit. Not registered as a public runtime asset. */
importScripts('../vendor/ort.min.js');
onmessage=async({data})=>{
 try{
  ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=new URL('../vendor/',self.location.href).href;
  const folder=new URL(data.folder,self.location.href);
  const metadata=await(await fetch(new URL('metadata.json',folder))).json();
  const source=new Uint8Array(await(await fetch(new URL('model.onnx',folder))).arrayBuffer());
  const externalData=[];
  for(const info of metadata.external_data){const url=new URL(info.path,folder);url.searchParams.set('sha256',info.sha256);let response;try{response=await(await caches.open('euroguessr-models-v2')).match(url.href);}catch{}response=response||await fetch(url);externalData.push({path:info.path,data:new Uint8Array(await response.arrayBuffer())});}
  const session=await ort.InferenceSession.create(source,{executionProviders:['wasm'],externalData});
  const results=[];
  for(const sample of data.samples){const tensor=new ort.Tensor('float32',new Float32Array(sample.pixels),[1,3,224,224]);const outputs=await session.run({image:tensor});results.push({name:sample.name,pixels:sample.pixels,embedding:Array.from(outputs.embedding.data)});tensor.dispose();Object.values(outputs).forEach(t=>t.dispose());}
  await session.release();postMessage({metadata:{version:metadata.version,model_sha256:metadata.model_sha256},results});
 }catch(error){postMessage({error:error.message});}
};
