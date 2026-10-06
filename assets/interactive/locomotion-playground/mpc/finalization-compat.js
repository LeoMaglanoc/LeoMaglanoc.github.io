// CasADi WASM 3.8.1 SWIG finalizers can free borrowed native handles after a
// Function.call conversion. Browser GC then corrupts subsequent solver calls.
// Keep the upstream files unchanged and use explicit ownership in runtime.js.
// Worker termination releases remaining temporary native allocations.
export class ExplicitFinalizationRegistry {
  constructor(_callback) {}
  register(_target,_value,_token) {}
  unregister(_token) {return false;}
}
