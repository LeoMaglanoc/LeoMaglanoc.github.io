export class MPCWorkerClient {
  constructor(onResult,onError,workerFactory=url=>new Worker(url,{type:'module'})) {
    this.onResult=onResult;this.onError=onError;this.generation=0;this.busy=false;this.ready=false;this.sequence=0;
    this.workerFactory=workerFactory;this.completed=0;this.disposed=false;this.launchWorker();
  }
  launchWorker() {
    this.ready=false;this.busy=false;
    const worker=this.workerFactory(new URL('./worker.js?v=3',import.meta.url));this.worker=worker;
    worker.onmessage=({data})=>{
      if(this.disposed || this.worker!==worker)return;
      if(data.type==='ready'){this.failed=false;this.ready=true;this.setupTimeMs=data.setupTimeMs;this.onReady?.();return;}
      if(data.type==='solved' || data.type==='error'){
        this.busy=false;
        if(data.generation!==undefined && data.generation!==this.generation)return;
        if(data.type==='error'){this.failed=true;const error=new Error(typeof data.error==='string'?data.error:JSON.stringify(data.error));if(data.stack)error.stack=data.stack;error.state=data.state;this.onError(error);return;}
        this.onResult({...data.result,roundTripMs:performance.now()-data.submitted});
        // Explicit ownership avoids broken package finalizers. Periodically
        // release the whole heap to bound temporary native allocations.
        if(++this.completed>=128){this.generation++;worker.terminate();this.completed=0;this.launchWorker();}
      }
    };
    worker.onerror=e=>{if(this.disposed || this.worker!==worker)return;this.busy=false;this.failed=true;this.onError(new Error(e.message||'MPC worker failed'));};
    worker.postMessage({type:'init'});
  }
  solve(state) {
    if(!this.ready || this.busy)return false;
    this.busy=true;this.worker.postMessage({type:'solve',generation:this.generation,id:++this.sequence,submitted:performance.now(),state});return true;
  }
  reset(){this.generation++;if(this.failed){this.worker.terminate();this.launchWorker();}else this.worker.postMessage({type:'reset'});}
  dispose(){this.disposed=true;this.ready=false;this.generation++;this.worker.terminate();}
}
