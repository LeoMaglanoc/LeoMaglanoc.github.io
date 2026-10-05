"""Compare browser bicubic/crop implementation with GeoCLIP's actual AutoProcessor."""
import sys,json,subprocess
from pathlib import Path
import numpy as np
from PIL import Image
from transformers import AutoProcessor
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'training'))
from train import ROOT
from teacher_common import CLIP_REVISION
processor=AutoProcessor.from_pretrained('openai/clip-vit-large-patch14',revision=CLIP_REVISION)
script="import {clipResizeNormalize} from './src/clip-preprocess.js';let s='';for await(const c of process.stdin)s+=c;const a=JSON.parse(s);process.stdout.write(JSON.stringify(Array.from(clipResizeNormalize(a.pixels,a.width,a.height))));"
results=[]
for width,height in [(47,31),(31,47),(640,427),(427,640),(224,224),(1600,900)]:
    rgb=np.random.default_rng(42).integers(0,256,(height,width,3),dtype=np.uint8)
    rgba=np.concatenate([rgb,np.full((height,width,1),255,dtype=np.uint8)],2)
    actual=np.array(json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,input=json.dumps({'pixels':rgba.ravel().tolist(),'width':width,'height':height}).encode())),dtype=np.float32)
    expected=processor(images=Image.fromarray(rgb),return_tensors='np')['pixel_values'][0].ravel()
    error=float(np.abs(actual-expected).max());results.append({'width':width,'height':height,'max_error':error})
    assert error<1e-5,results[-1]
print(json.dumps(results,indent=2))
