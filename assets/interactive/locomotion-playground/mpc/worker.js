import { NativeMPCRuntime } from './runtime.js?v=3';
const runtime=new NativeMPCRuntime();let ready=false;
self.onmessage=async ({data})=>{
  try {
    if(data.type==='init'){const start=performance.now();await runtime.init(data.backend);ready=true;self.postMessage({type:'ready',setupTimeMs:performance.now()-start});return;}
    if(data.type==='reset'){runtime.reset();return;}
    if(data.type==='solve'){
      if(!ready)throw new Error('Solver is not initialized');
      const result=runtime.solve(data.state);self.postMessage({type:'solved',id:data.id,generation:data.generation,result,submitted:data.submitted});
    }
  }catch(error){self.postMessage({type:'error',id:data.id,generation:data.generation,error:error.message,stack:error.stack,state:data.state});}
};
