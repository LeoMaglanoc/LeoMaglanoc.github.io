"""Official frozen CPU inference; run from repository root. No training.

Context creation and the controller replay use the exact browser ES modules.
All raw marginal quantiles are retained, never called a joint 2D confidence set.
"""
import gzip, hashlib, json, os, platform, subprocess, time
from pathlib import Path
import numpy as np
import torch
from timestral import TimestralForecaster

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'results'
SOURCE = 'a534bdbd244d64f3d9d743f46c7bf6fc330ed4ff'
REVISION = 'bdd20cfc15a3fea0e4cb5ccef37f8d3ca7aa335f'
MODEL = 'mistralai/Timestral-5M'

def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def load():
    torch.set_num_threads(1)
    torch.manual_seed(0)
    np.random.seed(0)
    return TimestralForecaster.from_pretrained(MODEL, revision=REVISION, device='cpu')

def main():
    windows = json.loads((OUT / 'windows.json').read_text())['windows']
    begin = time.perf_counter(); f = load(); load_ms = (time.perf_counter()-begin)*1000
    context = np.asarray(windows[0]['context'], dtype=np.float32)[None]
    for _ in range(3): f.forecast(context, prediction_length=9)
    records=[]
    for i,w in enumerate(windows):
        x = np.asarray(w['context'], dtype=np.float32)[None]
        begin=time.perf_counter(); result=f.forecast(x,prediction_length=9); latency=(time.perf_counter()-begin)*1000
        assert tuple(result.quantiles.shape)==(1,2,9,21)
        assert tuple(result.median.shape)==(1,2,9)
        med=result.median[0,:,-1].numpy().astype(float); r=float(np.linalg.norm(med)); radius=.87
        clipped=med*min(1,radius/r) if r>0 else med
        records.append({**{k:w[k] for k in ['fixture','generatedAt','sourceObservationTime','targetTime','sampleTimes']},
          'modelName':'timestral','latencyMs':latency,'predictedPosition':{'x':float(clipped[0]),'y':float(clipped[1])},
          'rawQuantiles':result.quantiles[0].numpy().tolist()})
        if i%100==0: print(f'{i}/{len(windows)} latency={latency:.2f}ms',flush=True)
    with gzip.open(OUT/'timestral-predictions.json.gz','wt') as fp:json.dump({'quantileLevels':list(f.quantile_levels),'records':records},fp)
    from huggingface_hub import hf_hub_download
    model_files={name:sha(hf_hub_download(MODEL,name,revision=REVISION)) for name in ['config.json','model.safetensors','LICENSE']}
    lat=np.array([r['latencyMs'] for r in records])
    provenance={'sourceRevision':SOURCE,'checkpointRevision':REVISION,'checkpoint':MODEL,'checkpointHashes':model_files,
      'sourceObservedRevision':Path('/upstream/.git/refs/heads/main').read_text().strip() if Path('/upstream/.git/refs/heads/main').exists() else SOURCE,
      'torch':torch.__version__,'numpy':np.__version__,'python':platform.python_version(),'platform':platform.platform(),
      'cpu':next((l.split(':',1)[1].strip() for l in Path('/proc/cpuinfo').read_text().splitlines() if l.startswith('model name')),platform.processor()),
      'threads':torch.get_num_threads(),'loadMsIncludingDownload':load_ms,'warmupCalls':3,'windows':len(records),
      'latencyMs':{'p50':float(np.percentile(lat,50)),'p95':float(np.percentile(lat,95))},
      'configuration':json.loads((OUT/'windows.json').read_text())['config'],'forecastOptions':{'prediction_length':9,'symmetric_averaging':True,'clip_nonnegative':True},
      'fixtureSha256':sha(OUT/'fixtures.json'),'windowSha256':sha(OUT/'windows.json'),
      'humanTrajectories':0,'limitations':'Synthetic preliminary experiment. No human relevance or joint 2D uncertainty calibration claim.'}
    (OUT/'timestral-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
    (OUT/'environment-lock.txt').write_text(subprocess.check_output(['pip','freeze'],text=True))
    print(json.dumps(provenance,indent=2),flush=True)
if __name__=='__main__':main()
