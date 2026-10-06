import {test} from 'node:test';import assert from 'node:assert/strict';import {MPCWorkerClient} from '../mpc/client.js';
test('single outstanding solve; ignore stale reset results; terminate on dispose',()=>{
 const messages=[],results=[],errors=[];const worker={postMessage:m=>messages.push(m),terminate(){this.terminated=true;}};
 const c=new MPCWorkerClient(r=>results.push(r),e=>errors.push(e),()=>worker);
 assert.equal(c.solve({}),false);worker.onmessage({data:{type:'ready',setupTimeMs:12}});assert.equal(c.solve({}),true);assert.equal(c.solve({}),false);
 const generation=c.generation;c.reset();worker.onmessage({data:{type:'solved',generation,submitted:performance.now(),result:{torque:[1]}}});assert.equal(results.length,0);assert.equal(c.busy,false);
 assert.equal(c.solve({}),true);worker.onmessage({data:{type:'solved',generation:c.generation,submitted:performance.now(),result:{torque:[2]}}});assert.equal(results.length,1);
 assert.equal(c.solve({}),true);worker.onmessage({data:{type:'error',generation:c.generation,error:'infeasible'}});assert.equal(errors.length,1);assert.equal(c.busy,false);
 c.dispose();assert.equal(worker.terminated,true);assert.equal(messages.filter(m=>m.type==='solve').length,3);
});
test('recycle native heap after 128 solutions without retaining old worker callbacks',()=>{
 const workers=[],results=[];
 const factory=()=>{const w={postMessage(){},terminate(){this.terminated=true;}};workers.push(w);return w;};
 const client=new MPCWorkerClient(r=>results.push(r),e=>{throw e;},factory),first=workers[0];
 first.onmessage({data:{type:'ready',setupTimeMs:1}});
 for(let i=0;i<128;i++){assert.equal(client.solve({}),true);first.onmessage({data:{type:'solved',generation:client.generation,submitted:performance.now(),result:{torque:[i]}}});}
 assert.equal(results.length,128);assert.equal(first.terminated,true);assert.equal(workers.length,2);assert.equal(client.ready,false);
 first.onmessage({data:{type:'ready'}});assert.equal(client.ready,false);
 workers[1].onmessage({data:{type:'ready',setupTimeMs:2}});assert.equal(client.solve({}),true);
 client.dispose();assert.equal(workers[1].terminated,true);
});
test('reset after solver error replaces the failed worker',()=>{
 const workers=[];const factory=()=>{const w={postMessage(){},terminate(){this.terminated=true;}};workers.push(w);return w;};
 const c=new MPCWorkerClient(()=>{},()=>{},factory),first=workers[0];first.onmessage({data:{type:'ready'}});c.solve({});
 first.onmessage({data:{type:'error',generation:c.generation,error:'memory access out of bounds'}});c.reset();
 assert.equal(first.terminated,true);assert.equal(workers.length,2);assert.equal(c.ready,false);c.dispose();
});
