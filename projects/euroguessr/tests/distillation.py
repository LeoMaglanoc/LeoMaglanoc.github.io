"""Small deterministic contract tests; GeoCLIP's actual numerical benchmark is separate."""
import sys,json,tempfile,hashlib,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'training'))
import numpy as np
import torch
from student_train import Student,loss_terms,warm_start,deadline_reached
from train import ROOT,cells,distance
from teacher_common import balanced_subset,atomic_json,fingerprint,manifest_fingerprint
from cache_teacher import load_cache

class Contracts(unittest.TestCase):
 def test_embedding_only_ignores_soft_geographic_targets(self):
  torch.manual_seed(42)
  source_logits=torch.randn(3,4);source_z=torch.nn.functional.normalize(torch.randn(3,512),dim=1)
  teacher_z=torch.nn.functional.normalize(torch.randn(3,512),dim=1);prob=torch.softmax(torch.randn(3,4),dim=1)
  results=[]
  for targets in [prob,prob.flip(1)]:
   logits=source_logits.clone().requires_grad_();z=source_z.clone().requires_grad_()
   total,geo,kd,embed=loss_terms(logits,z,torch.tensor([0,1,2]),torch.ones(4),targets,teacher_z,torch.tensor([True,False,True]),2,.7,0,.3)
   self.assertTrue(torch.equal(total,.7*geo+.3*embed))
   total.backward();results.append((total.detach(),logits.grad,z.grad))
  for a,b in zip(*results):self.assertTrue(torch.equal(a,b),'Zero-weight KL changed the embedding-only objective or gradients')
 def test_partial_targets_and_all_supervision(self):
  torch.manual_seed(42)
  logits=torch.randn(3,4,requires_grad=True);z=torch.nn.functional.normalize(torch.randn(3,512),dim=1).requires_grad_()
  prob=torch.softmax(torch.randn(3,4),dim=1);tz=torch.nn.functional.normalize(torch.randn(3,512),dim=1)
  labels=torch.tensor([0,1,2]);mask=torch.tensor([True,False,False])
  total,geo,kd,embed=loss_terms(logits,z,labels,torch.ones(4),prob,tz,mask,2,.5,.2,.3)
  total.backward()
  self.assertTrue((logits.grad[1:].abs().sum(1)>0).all())
  self.assertEqual(float(z.grad[1:].abs().sum()),0)
  self.assertGreater(float(z.grad[0].abs().sum()),0)
  _,_,a,b=loss_terms(logits,z,labels,torch.ones(4),prob,tz,torch.zeros(3,dtype=torch.bool),2,.5,.2,.3)
  self.assertEqual(float(a),0);self.assertEqual(float(b),0)
 def test_projection_and_warm_start(self):
  torch.set_num_threads(2);m=Student(64)
  z=m.project(torch.randn(4,576));self.assertEqual(tuple(z.shape),(4,512))
  self.assertTrue(torch.allclose(z.norm(dim=1),torch.ones(4),atol=1e-6))
  old=torch.load(ROOT/'checkpoints/current/best.pt',weights_only=False)
  before=m.head[-1].weight.detach().clone();self.assertGreater(warm_start(m,old),0)
  self.assertTrue(torch.equal(before,m.head[-1].weight))
  for k,v in old['model'].items():
   if k.startswith('encoder.'):self.assertTrue(torch.equal(v,m.state_dict()[k]))
 def test_new_cells_and_balancing(self):
  gps=np.random.default_rng(42).uniform([35,-20],[70,40],(300,2));c=cells(gps,64,42)
  self.assertEqual(c.shape,(64,2));self.assertTrue(np.array_equal(c,cells(gps,64,42)))
  rows=[{'id':str(i),'split':'train' if i<90 else 'test','country':['FR','DE','ES'][i%3],'latitude':str(gps[i,0]),'longitude':str(gps[i,1]),'sequence':str(i)} for i in range(100)]
  selected=balanced_subset(rows,c,30);self.assertEqual(len(selected),30);self.assertEqual(len({r['country'] for r in selected}),3)
  self.assertTrue(all(r['split']=='train' for r in selected));self.assertEqual(selected,balanced_subset(rows,c,30))
 def test_cache_partial_resume_and_corruption(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);ids=['a','b'];z=np.zeros((2,512),dtype=np.float32);z[:,0]=1;prob=np.full((2,4),.25,dtype=np.float32)
   np.savez_compressed(p/'chunk.npz',ids=np.array(ids),embeddings=z,probabilities=prob)
   identity={'role':'train','selected_ids':['a','b','c'],'centers':[[40,0]]*4,'temperature':2}
   meta={'identity':identity,'identity_sha256':fingerprint(identity),'chunks':[{'file':'chunk.npz','ids':ids,'sha256':hashlib.sha256((p/'chunk.npz').read_bytes()).hexdigest()}]}
   atomic_json(meta,p/'index.json');_,loaded=load_cache(p);self.assertEqual(set(loaded),set(ids))
   _,again=load_cache(p);self.assertTrue(np.array_equal(loaded['a'][0],again['a'][0]))
   with self.assertRaisesRegex(ValueError,'role'):load_cache(p,role='val')
   meta['identity']['temperature']=3;atomic_json(meta,p/'index.json')
   with self.assertRaisesRegex(ValueError,'identity'):load_cache(p)
   meta['identity']['temperature']=2;atomic_json(meta,p/'index.json');(p/'chunk.npz').write_bytes(b'corrupt')
   with self.assertRaisesRegex(ValueError,'checksum'):load_cache(p)
 def test_deadline(self):
  self.assertTrue(deadline_reached(0));self.assertFalse(deadline_reached(None));self.assertFalse(deadline_reached(1e20))

if __name__=='__main__':unittest.main()
