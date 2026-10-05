"""Attach GeoCLIP's exact MLP to pinned image-only 8-bit CLIP and shard its weights.
No text tower, tokenizer, or online location encoder is exported.
"""
import argparse,hashlib,json,importlib.metadata,time
from pathlib import Path
import numpy as np
import torch
import onnx
from onnx import helper,numpy_helper,TensorProto
from onnx.external_data_helper import set_external_data
from train import ROOT
from teacher_common import atomic_json,VERSION
REVISION='c307790166907339eed5a9a53a249af534102536'
URL=f'https://huggingface.co/Xenova/clip-vit-large-patch14/resolve/{REVISION}/onnx/vision_model_quantized.onnx'

def shard(model,dest,max_bytes=64*1024*1024):
    records=[];out=None;size=0;file=None
    for value in model.graph.initializer:
        if not value.raw_data or len(value.raw_data)<1024:continue
        if out is None or size+len(value.raw_data)>max_bytes:
            if out:out.close()
            file=f'weights-{len(records):02d}.bin';out=(dest/file).open('wb');size=0;records.append({'path':file})
        raw=value.raw_data;out.write(raw)
        set_external_data(value,location=file,offset=size,length=len(raw));value.ClearField('raw_data');value.data_location=TensorProto.EXTERNAL;size+=len(raw)
    if out:out.close()
    for r in records:r.update(bytes=(dest/r['path']).stat().st_size,sha256=hashlib.sha256((dest/r['path']).read_bytes()).hexdigest())
    return records

def float_patch_conv(model):
    """ORT CPU lacks signed ConvInteger. Keep signed MatMuls, dequantize patch Conv.
    This is a measured alternate export, not an untested runtime fallback.
    """
    values={v.name:numpy_helper.to_array(v) for v in model.graph.initializer}
    convs=[n for n in model.graph.node if n.op_type=='ConvInteger']
    if len(convs)!=1:raise ValueError('Expected exactly one quantized patch convolution')
    conv=convs[0]
    cast=next(n for n in model.graph.node if conv.output[0] in n.input)
    mul=next(n for n in model.graph.node if cast.output[0] in n.input)
    scale_mul=next(n for n in model.graph.node if n.output[0]==mul.input[1])
    dynamic=next(n for n in model.graph.node if n.output[0]==conv.input[0])
    weight=values[conv.input[1]].astype(np.float32)
    zero=values[conv.input[3]].astype(np.float32)
    scale=values[scale_mul.input[1]].astype(np.float32)
    if scale.size>1:scale=scale.reshape(-1,1,1,1);zero=zero.reshape(-1,1,1,1)
    model.graph.initializer.extend([numpy_helper.from_array((weight-zero)*scale,'geoclip_fp32_patch_weight')])
    replacement=helper.make_node('Conv',[dynamic.input[0],'geoclip_fp32_patch_weight'],[mul.output[0]],name='geoclip_fp32_patch_conv')
    replacement.attribute.extend(conv.attribute)
    nodes=[]
    removed={conv.name,cast.name,mul.name,scale_mul.name}
    for node in model.graph.node:
        if node.name==conv.name:nodes.append(replacement)
        elif node.name not in removed:nodes.append(node)
    del model.graph.node[:];model.graph.node.extend(nodes)
    # Remove unused integer path and initializers while retaining graph outputs.
    needed={v.name for v in model.graph.output};live=[]
    for node in reversed(model.graph.node):
        if any(o in needed for o in node.output):live.append(node);needed.update(node.input)
    del model.graph.node[:];model.graph.node.extend(reversed(live))
    initializers=[v for v in model.graph.initializer if v.name in needed]
    del model.graph.initializer[:];model.graph.initializer.extend(initializers)

def weight_only(model):
    """Keep 8-bit stored weights, but remove dynamic activation quantization.
    Constant DequantizeLinear permits identical FP32 arithmetic on native/WASM.
    This trades resident memory for stability while retaining the small download.
    """
    producers={o:n for n in model.graph.node for o in n.output}
    consumers={}
    for n in model.graph.node:
        for i in n.input:consumers.setdefault(i,[]).append(n)
    initializers={v.name for v in model.graph.initializer}
    replacements={};removed=set()
    quantized=[n for n in model.graph.node if n.op_type=='MatMulInteger']
    for index,node in enumerate(quantized):
        dynamic=producers[node.input[0]]
        if dynamic.op_type!='DynamicQuantizeLinear':raise ValueError('Unexpected activation quantization graph')
        cast=next(n for n in consumers[node.output[0]] if n.op_type=='Cast')
        scaled=next(n for n in consumers[cast.output[0]] if n.op_type=='Mul')
        scale_product=producers[next(i for i in scaled.input if i!=cast.output[0])]
        weight_scale=next(i for i in scale_product.input if i in initializers)
        output=f'geoclip_weight_only_{index}'
        dequant=helper.make_node('DequantizeLinear',[node.input[1],weight_scale,node.input[3]],[output],name=output+'_dequant',axis=1)
        matmul=helper.make_node('MatMul',[dynamic.input[0],output],[scaled.output[0]],name=output+'_matmul')
        replacements[node.name]=[dequant,matmul];removed.update([node.name,cast.name,scaled.name,scale_product.name])
    nodes=[]
    for node in model.graph.node:
        if node.name in replacements:nodes.extend(replacements[node.name])
        elif node.name not in removed:nodes.append(node)
    needed={v.name for v in model.graph.output};live=[]
    for node in reversed(nodes):
        if any(o in needed for o in node.output):live.append(node);needed.update(node.input)
    del model.graph.node[:];model.graph.node.extend(reversed(live))
    values=[v for v in model.graph.initializer if v.name in needed]
    del model.graph.initializer[:];model.graph.initializer.extend(values)
    if any(n.op_type in ['DynamicQuantizeLinear','MatMulInteger','ConvInteger'] for n in model.graph.node):raise ValueError('Dynamic integer arithmetic remains')

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,default=ROOT/'artifacts/geoclip-direct/vision-quantized.onnx');p.add_argument('--output',type=Path,default=ROOT/'artifacts/geoclip-direct/models');p.add_argument('--source-url',default=URL);p.add_argument('--float-patch-conv',action='store_true');p.add_argument('--weight-only',action='store_true');p.add_argument('--grid-degrees',type=float,default=.5);args=p.parse_args();torch.set_num_threads(2)
    source=args.source;dest=args.output;dest.mkdir(parents=True,exist_ok=True)
    if not source.exists():
        import requests
        source.parent.mkdir(parents=True,exist_ok=True)
        with requests.get(args.source_url,stream=True,timeout=(30,120)) as r:
            r.raise_for_status()
            with source.with_suffix('.tmp').open('wb') as f:
                for block in r.iter_content(1024*1024):f.write(block)
        source.with_suffix('.tmp').replace(source)
    model=onnx.load(source)
    linear_type=next(v.data_type for v in model.graph.initializer if v.name==next(n.input[1] for n in model.graph.node if n.op_type=='MatMulInteger'))
    linear_precision='UINT8' if linear_type==TensorProto.UINT8 else 'INT8'
    if args.float_patch_conv or args.weight_only:float_patch_conv(model)
    if args.weight_only:
        if next(v.version for v in model.opset_import if v.domain=='')<13:model=onnx.version_converter.convert_version(model,13)
        weight_only(model)
    if [a.name for a in model.graph.output]!=['image_embeds']:raise ValueError('Unexpected upstream vision outputs')
    for value in model.graph.input:
        if value.name=='pixel_values':
            value.name='image'
            for d,n in zip(value.type.tensor_type.shape.dim,[1,3,224,224]):d.ClearField('dim_param');d.dim_value=n
    for node in model.graph.node:
        for i,name in enumerate(node.input):
            if name=='pixel_values':node.input[i]='image'
    package=importlib.metadata.distribution('geoclip')
    weight_path=Path(package.locate_file('geoclip/model/weights/image_encoder_mlp_weights.pth'))
    weights=torch.load(weight_path,map_location='cpu',weights_only=True)
    for layer in [0,2]:
        model.graph.initializer.extend([numpy_helper.from_array(weights[f'{layer}.weight'].numpy().T.copy(),f'geo_w{layer}'),numpy_helper.from_array(weights[f'{layer}.bias'].numpy(),f'geo_b{layer}')])
    model.graph.initializer.extend([numpy_helper.from_array(np.array(1e-12,dtype=np.float32),'geo_epsilon')])
    model.graph.node.extend([
        helper.make_node('MatMul',['image_embeds','geo_w0'],['geo_linear0']),helper.make_node('Add',['geo_linear0','geo_b0'],['geo_bias0']),helper.make_node('Relu',['geo_bias0'],['geo_relu']),
        helper.make_node('MatMul',['geo_relu','geo_w2'],['geo_linear2']),helper.make_node('Add',['geo_linear2','geo_b2'],['geo_raw']),helper.make_node('ReduceL2',['geo_raw'],['geo_norm'],axes=[1],keepdims=1),helper.make_node('Max',['geo_norm','geo_epsilon'],['geo_safe_norm']),helper.make_node('Div',['geo_raw','geo_safe_norm'],['embedding'])])
    del model.graph.output[:];model.graph.output.extend([helper.make_tensor_value_info('embedding',TensorProto.FLOAT,[1,512])])
    external=shard(model,dest);(dest/'model.onnx').write_bytes(model.SerializeToString());onnx.checker.check_model(str(dest/'model.onnx'))
    # Europe-only regular GPS gallery is independent of image labels and splits.
    lat=np.arange(34,72+1e-8,args.grid_degrees);lon=np.arange(-25,45+1e-8,args.grid_degrees)
    gps=np.array([[a,b] for a in lat for b in lon],dtype=np.float32)
    from geoclip import LocationEncoder
    encoder=LocationEncoder().cpu().eval();vectors=[]
    with torch.inference_mode():
        for start in range(0,len(gps),256):vectors.append(torch.nn.functional.normalize(encoder(torch.from_numpy(gps[start:start+256])),dim=1).numpy())
    gallery=np.concatenate(vectors);gallery.astype('<f4').tofile(dest/'references.f32')
    atomic_json({'feature_file':'references.f32','count':len(gps),'dimensions':512,'gps':gps.tolist(),'kind':'regular offline location grid; no ground-truth/image lookup'},dest/'references.json')
    files=[{'path':'model.onnx','bytes':(dest/'model.onnx').stat().st_size,'sha256':hashlib.sha256((dest/'model.onnx').read_bytes()).hexdigest()},*external,{'path':'references.f32','bytes':(dest/'references.f32').stat().st_size,'sha256':hashlib.sha256((dest/'references.f32').read_bytes()).hexdigest()}]
    model_sha=files[0]['sha256']
    meta={'model_sha256':model_sha,'version':f'geoclip-direct-8bit-europe-{model_sha[:12]}','architecture':'GeoCLIP image-only: quantized CLIP ViT-L/14 + FP32 GeoCLIP projection MLP','method':'retrieval-1','embedding_output':'embedding','preprocessing':'clip-bicubic-center-crop','precision':(f'{linear_precision} CLIP linear weights + FP32 patch convolution/GeoCLIP MLP' if args.float_patch_conv else f'{linear_precision} CLIP linear/convolution weights + FP32 GeoCLIP MLP'),'parameters':304950528,'external_data':external,'files':files,'download_bytes':sum(f['bytes'] for f in files),'source':{'clip_onnx_url':args.source_url,'revision':REVISION,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'teacher':VERSION,'projection_sha256':hashlib.sha256(weight_path.read_bytes()).hexdigest(),'float_patch_conv':args.float_patch_conv},'gallery':{'grid_degrees':args.grid_degrees,'count':len(gps),'bounds':{'lat':[34,72],'lon':[-25,45]}},'candidates':{},'human_benchmark':'Not measured','test_status':'not evaluated'}
    meta['source']['weight_only']=args.weight_only
    if args.weight_only:
        meta['precision']=f'{linear_precision} stored linear weights; FP32 activation arithmetic, patch convolution and GeoCLIP MLP'
        meta['source']['float_patch_conv']=True
    atomic_json(meta,dest/'metadata.json');print(json.dumps({'download_bytes':meta['download_bytes'],'external_data_files':len(external),'gallery_count':len(gps)}),flush=True)
if __name__=='__main__':main()
