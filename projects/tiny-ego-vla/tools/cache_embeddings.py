"""Frozen paired image/text features, encoded once and cached by checkpoint identity."""
from common import *
import torch, numpy as np, h5py
from PIL import Image
ENCODER_SHA='809b408eff74f8058843e86a1f92967097d42ba782450e85b8f4867b7f0ca0b7'
def encode(frames,model,transform,batch=16):
    zs=[]
    with torch.inference_mode():
        for start in range(0,len(frames),batch):
            x=torch.stack([transform(Image.fromarray(f)) for f in frames[start:start+batch]])
            z=model.encode_image(x); z=torch.nn.functional.normalize(z,dim=-1)
            zs.append(z.numpy())
    return np.concatenate(zs)
def main(mode):
    model,transform,tokenizer=load_encoder('MobileCLIP-S0')
    checkpoint=CKPT/'mobileclip_s0.pt'
    assert sha(checkpoint)==ENCODER_SHA
    t0=time.perf_counter()
    if mode=='ego':
        for video in ['P01_03','P01_08','P01_04']:
            out=DATA/f'{video}_embeddings.npz'
            if out.exists(): continue
            frames=np.load(DATA/f'{video}_processed.npz')['frames']
            meta=json.loads((DATA/f'{video}_labels.json').read_text())
            unique=sorted(set(meta['instructions']))
            with torch.inference_mode():
                zt=torch.nn.functional.normalize(model.encode_text(tokenizer(unique)),dim=-1).numpy()
            zi=encode(frames,model,transform)
            np.savez_compressed(out,visual=zi,text=zt,instruction_ids=np.array([unique.index(s) for s in meta['instructions']]))
            print(video,zi.shape,'elapsed',time.perf_counter()-t0,flush=True)
    else:
        for task in ['bowl_plate','bowl_ramekin']:
            with h5py.File(DATA/f'{task}.hdf5') as f:
                instruction=json.loads(f['data'].attrs['problem_info'])['language_instruction']
                with torch.inference_mode():
                    text=torch.nn.functional.normalize(model.encode_text(tokenizer([instruction])),dim=-1).numpy()[0]
                for i in range(50):
                    out=DATA/f'{task}_demo_{i:02d}.npz'
                    if out.exists(): continue
                    d=f[f'data/demo_{i}']; n=len(d['actions']); idx=np.arange(0,n,2)
                    # HDF5 uses OpenGL convention: flip to upright RGB, same as rollout images.
                    frames=d['obs/agentview_rgb'][idx][:,::-1].copy()
                    visual=encode(frames,model,transform)
                    proprio=np.concatenate([d['obs/ee_states'][idx],d['obs/gripper_states'][idx]],axis=-1).astype('float32')
                    actions=np.array([d['actions'][min(j,n-1)] for k in idx for j in (k,k+1)]).reshape(-1,2,7).astype('float32')
                    np.savez_compressed(out,visual=visual,text=text,proprio=proprio,actions=actions,indices=idx)
                    print(task,i,n,'elapsed',round(time.perf_counter()-t0,1),flush=True)
    save_json(ART/f'{mode}-cache-metadata.json',{'encoder':'MobileCLIP-S0','checkpoint_sha256':ENCODER_SHA,'seconds':time.perf_counter()-t0,'git_commit':revision(),'stride':2 if mode=='robot' else 1})
if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(); p.add_argument('mode',choices=['ego','robot']); main(p.parse_args().mode)
