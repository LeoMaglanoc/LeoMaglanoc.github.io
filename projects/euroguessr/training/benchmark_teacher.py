"""Measure real GeoCLIP CPU throughput before sizing the teacher pass."""
import argparse, json, time, resource, os
from pathlib import Path
import numpy as np
import torch
from teacher_common import balanced_subset, embeddings, atomic_json, VERSION, manifest_fingerprint
from train import ROOT

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--manifest',type=Path,default=ROOT/'checkpoints/current/manifest.json')
    p.add_argument('--output',type=Path,default=ROOT/'artifacts/geoclip-overnight/teacher-benchmark.json')
    p.add_argument('--count',type=int,default=100)
    p.add_argument('--threads',type=int,default=2)
    p.add_argument('--batch-sizes',type=int,nargs='+',default=[1,2,4,8])
    args=p.parse_args(); torch.set_num_threads(args.threads)
    rows=json.loads(args.manifest.read_text())
    selected=balanced_subset(rows,[[53,10]],args.count)
    start=time.perf_counter()
    from teacher_common import load_teacher
    teacher=load_teacher()
    load=time.perf_counter()-start
    report={'teacher':VERSION,'manifest_sha256':manifest_fingerprint(rows),'image_ids':[r['id'] for r in selected], 'cold_load_seconds':load,'threads':args.threads,'results':[]}
    reference=None
    for size in args.batch_sizes:
        embeddings(teacher,selected[:size]) # warmup
        start=time.perf_counter(); cpu=time.process_time()
        z=torch.cat([embeddings(teacher,selected[i:i+size]) for i in range(0,len(selected),size)]).numpy()
        duration=time.perf_counter()-start; cpu=time.process_time()-cpu
        repeated=embeddings(teacher,selected[:size]).numpy()
        entry={'batch_size':size,'images':len(z),'seconds':duration,'seconds_per_image':duration/len(z),'images_per_second':len(z)/duration,'cpu_utilization_percent':100*cpu/duration,'peak_rss_mb':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,'dimension':z.shape[1],'max_norm_error':float(np.abs(np.linalg.norm(z,axis=1)-1).max()),'repeat_max_abs_error':float(np.abs(z[:size]-repeated).max()),'batch_max_abs_error':float(np.abs(z-reference).max()) if reference is not None else 0}
        if reference is None: reference=z
        report['results'].append(entry)
        report['best_batch_size']=min(report['results'],key=lambda r:r['seconds_per_image'])['batch_size']
        atomic_json(report,args.output); print(json.dumps(entry),flush=True)
    report['completed']=True; atomic_json(report,args.output)
if __name__=='__main__': main()
