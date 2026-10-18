"""Fixed-shape full official forecaster export probe, not a replacement model.

Export/parity must pass on diverse finite contexts before any browser integration.
Failure is saved as evidence. The official PyTorch model is never modified.
"""
import json, time, traceback, warnings, sys
from pathlib import Path
import numpy as np
import torch
from forecast_timestral import load, ROOT, SOURCE, REVISION
OUT=ROOT/'results'
class Reference(torch.nn.Module):
    def __init__(self, forecaster):
        super().__init__(); self.model=forecaster.model;self.forecaster=forecaster
    def forward(self, context):
        return self.forecaster.forecast(context,prediction_length=9).quantiles

def main():
    mapped = '--standard-symbolics' in sys.argv
    if mapped:
        torch.onnx.register_custom_op_symbolic('aten::asinh', lambda g, x: g.op('Asinh', x), 18)
    record={'standardAsinhMapping':mapped,'sourceRevision':SOURCE,'checkpointRevision':REVISION,'inputShape':[1,2,64],'outputShape':[1,2,9,21],
      'status':'started','browserIntegrationEnabled':False,'note':'Fixed-shape finite-input export only. Full normalization, symmetric averaging and nonnegative clipping included.'}
    try:
        f=load();wrapper=Reference(f).eval()
        windows=json.loads((OUT/'windows.json').read_text())['windows']
        x=torch.tensor([windows[0]['context']],dtype=torch.float32)
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter('always')
            torch.onnx.export(wrapper,(x,),str(OUT/'timestral-probe.onnx'),input_names=['context'],output_names=['quantiles'],opset_version=18,dynamo=False)
        record['warnings']=list(dict.fromkeys(str(w.message) for w in captured))
        import onnx, onnxruntime as ort
        model=onnx.load(str(OUT/'timestral-probe.onnx'));onnx.checker.check_model(model)
        session=ort.InferenceSession(str(OUT/'timestral-probe.onnx'),providers=['CPUExecutionProvider'])
        probes=[np.asarray([windows[i]['context']],dtype=np.float32) for i in range(0,len(windows),75)]
        probes += [np.zeros((1,2,64),np.float32),np.ones((1,2,64),np.float32)*.2,np.random.default_rng(42).uniform(-.5,.5,(1,2,64)).astype(np.float32)]
        parity=[]
        for x in probes:
            expected=wrapper(torch.from_numpy(x)).numpy();begin=time.perf_counter();actual=session.run(None,{'context':x})[0];lat=(time.perf_counter()-begin)*1000
            parity.append({'maxAbs':float(np.max(np.abs(expected-actual))),'medianMaxAbs':float(np.max(np.abs(expected[...,10]-actual[...,10]))),'allclose':bool(np.allclose(actual,expected,atol=1e-4,rtol=1e-3)),'latencyMs':lat})
        record['parity']=parity;record['status']='parity-passed' if all(p['allclose'] for p in parity) else 'parity-failed'
        record['onnxBytes']=(OUT/'timestral-probe.onnx').stat().st_size
        # Small reference fixtures for a future WASM test (never used as live predictions).
        np.savez_compressed(OUT/'onnx-parity-inputs.npz',inputs=np.stack(probes),expected=np.stack([wrapper(torch.from_numpy(x)).numpy() for x in probes]))
    except Exception as e:
        record['status']='export-failed';record['error']=repr(e);record['traceback']=traceback.format_exc();print(record['traceback'],flush=True)
    (OUT/('onnx-probe-mapped.json' if mapped else 'onnx-probe.json')).write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record,indent=2),flush=True)
if __name__=='__main__':main()
