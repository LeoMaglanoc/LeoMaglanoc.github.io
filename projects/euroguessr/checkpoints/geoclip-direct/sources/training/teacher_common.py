"""Shared CPU GeoCLIP contracts. Importing this module does not load GeoCLIP."""
import hashlib, json
from pathlib import Path
import numpy as np
import torch
from PIL import Image
from train import DATA

CLIP_REVISION='32bd64288804d66eefd0ccbe215aa642df71cc41'
VERSION = f'geoclip==1.2.1 / transformers==4.46.3 / openai/clip-vit-large-patch14@{CLIP_REVISION}'
PREPROCESS = 'GeoCLIP AutoProcessor: RGB, CLIP resize/center crop/normalize'

def load_teacher():
    # GeoCLIP's public constructor lacks a revision option; pin its two HF calls.
    from unittest.mock import patch
    from transformers import CLIPModel, AutoProcessor
    from geoclip import GeoCLIP
    model_load, processor_load = CLIPModel.from_pretrained, AutoProcessor.from_pretrained
    with patch.object(CLIPModel, 'from_pretrained', side_effect=lambda *a, **k: model_load(*a, revision=CLIP_REVISION, **k)), \
         patch.object(AutoProcessor, 'from_pretrained', side_effect=lambda *a, **k: processor_load(*a, revision=CLIP_REVISION, **k)):
        return GeoCLIP().cpu().eval()


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def manifest_fingerprint(rows):
    # Match existing checkpoint contract.
    return hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()

def atomic_json(value, path):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, separators=(',', ':'), allow_nan=False))
    tmp.replace(path)

def balanced_subset(rows, centers, count, seed=42):
    from train import distance
    rows = [r for r in rows if r['split'] == 'train']
    centers = np.asarray(centers)
    groups = {}
    for r in rows:
        cell = int(distance(np.array([[float(r['latitude']), float(r['longitude'])]]), centers).argmin())
        groups.setdefault((r['country'], cell), []).append(r)
    for g in groups.values():
        g.sort(key=lambda r: fingerprint([seed,r['id']]))
    selected, seen = [], set()
    keys = sorted(groups, key=lambda k: fingerprint([seed,k]))
    depth = 0
    while len(selected) < min(count, len(rows)):
        advanced = False
        for key in keys:
            group = groups[key]
            if depth < len(group):
                advanced = True; r = group[depth]
                if r['sequence'] not in seen:
                    selected.append(r); seen.add(r['sequence'])
                    if len(selected) == count: break
        if not advanced: break
        depth += 1
    return selected

def image_batch(teacher, rows):
    images = []
    for row in rows:
        with Image.open(DATA/'images'/f"{row['id']}.jpg") as image:
            images.append(teacher.image_encoder.preprocess_image(image.convert('RGB')))
    return torch.cat(images)

@torch.inference_mode()
def embeddings(teacher, rows):
    z = torch.nn.functional.normalize(teacher.image_encoder(image_batch(teacher, rows)), dim=1)
    a = z.cpu().numpy()
    if a.shape != (len(rows),512) or not np.isfinite(a).all() or not np.allclose(np.linalg.norm(a,axis=1),1,atol=1e-4):
        raise ValueError('Invalid teacher embeddings')
    return z
