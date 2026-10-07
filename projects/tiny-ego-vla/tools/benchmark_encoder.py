from common import *
import torch, numpy as np, psutil
from PIL import Image
torch.set_num_threads(4)
records=[]
for name in ['MobileCLIP2-S0','MobileCLIP-S0']:
    t=time.perf_counter()
    try: model, transform, tokenizer=load_encoder(name)
    except Exception as e:
        records.append({'model':name,'error':str(e)}); continue
    load=time.perf_counter()-t
    x=transform(Image.new('RGB',(256,256),(160,120,100))).unsqueeze(0)
    txt=tokenizer(['pick up the black bowl and place it on the plate'])
    with torch.inference_mode():
        model.encode_image(x); model.encode_text(txt)
        ts=[]
        for _ in range(5):
            t=time.perf_counter(); z=model.encode_image(x); ts.append(time.perf_counter()-t)
        t=time.perf_counter(); model.encode_image(x.repeat(16,1,1,1)); batch=time.perf_counter()-t
        t=time.perf_counter(); model.encode_text(txt); text=time.perf_counter()-t
    records.append({'model':name,'load_seconds':load,'image_median_seconds':float(np.median(ts)),'batch16_seconds':batch,'text_seconds':text,'embedding_dim':z.shape[-1],'rss_mb':psutil.Process().memory_info().rss/2**20})
    del model
    save_json(ART/'encoder-benchmark.json',records)
    print(records[-1],flush=True)
