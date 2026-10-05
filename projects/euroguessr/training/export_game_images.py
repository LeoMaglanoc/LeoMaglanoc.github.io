"""Recover the highest OSV-5M archive resolution for the existing held-out photo pack."""
import argparse,json,io,hashlib
from pathlib import Path
from PIL import Image
from prepare import ROOT,index,source_bytes
from teacher_common import atomic_json

def main():
    p=argparse.ArgumentParser();p.add_argument('--max-size',type=int,default=1600);p.add_argument('--quality',type=int,default=90);p.add_argument('--output',type=Path,default=ROOT/'artifacts/geoclip-overnight/game-image-report.json');args=p.parse_args()
    pack=json.loads((ROOT/'rounds.json').read_text());entries=index('test',0);report=[]
    for r in pack:
        original=source_bytes(r,entries[r['id']]);image=Image.open(io.BytesIO(original)).convert('RGB');size=image.size
        image.thumbnail((args.max_size,args.max_size))
        path=ROOT/r['image'];tmp=path.with_suffix('.tmp');image.save(tmp,format='JPEG',quality=args.quality,optimize=True);tmp.replace(path)
        r['original_dimensions']=list(size);r['exported_dimensions']=list(image.size)
        r['modified']=f"aspect ratio preserved; maximum {args.max_size} px without upscaling; JPEG quality {args.quality}"
        report.append({'id':r['id'],'original_dimensions':list(size),'exported_dimensions':list(image.size),'bytes':path.stat().st_size,'source_sha256':hashlib.sha256(original).hexdigest()})
        print(r['id'],size,'->',image.size,flush=True)
    atomic_json(pack,ROOT/'rounds.json')
    atomic_json({'images':report,'total_bytes':sum(r['bytes'] for r in report),'note':'Highest resolution present in pinned OSV-5M ZIPs; no live Mapillary token/API. Never upscaled.'},args.output)
    # Refresh the deployed precision's numerical fixture for its actual public photograph.
    import onnxruntime as ort
    from train import tensor
    opts=ort.SessionOptions();opts.intra_op_num_threads=2
    session=ort.InferenceSession(str(ROOT/'models/model.onnx'),sess_options=opts,providers=['CPUExecutionProvider'])
    out=session.run(None,{'image':tensor(ROOT/pack[0]['image']).unsqueeze(0).numpy()})
    fixture=json.loads((ROOT/'models/fixture.json').read_text());fixture.update(image=pack[0]['image'],embedding=out[0][0].tolist(),logits=out[1][0].tolist())
    if len(out)>2:fixture['projection']=out[2][0].tolist()
    atomic_json(fixture,ROOT/'models/fixture.json')
if __name__=='__main__':main()
