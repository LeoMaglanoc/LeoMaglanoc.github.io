#!/usr/bin/env python3
"""Assemble a validated experiment in a staging directory before replacing web evidence."""
import hashlib,json,pathlib,shutil,sys,subprocess
root=pathlib.Path(__file__).resolve().parents[1]
run=root/sys.argv[1]
stage=root/'artifacts/publication'
if stage.exists(): shutil.rmtree(stage)
(stage/'models').mkdir(parents=True)
(stage/'metrics').mkdir()
m=json.loads((run/'run-metadata.json').read_text())
for rel,digest in m['artifact_hashes'].items():
    assert hashlib.sha256((run/rel).read_bytes()).hexdigest()==digest,rel
results=json.loads((run/'metrics/holdout.json').read_text())
champion=m['checkpoint_generation']
thresholds={'random':.995,'heuristic':.98,'heuristic-mcts-256':.90,'gen-0':.98,'gen-5':.95}
for opponent,threshold in thresholds.items():
    rows=[r for r in results if r['generation']==champion and r['opponent']==opponent and r['simulations']==256]
    assert rows and all(r['games']>=400 and r['win_rate']>=threshold for r in rows), f'Strength gate failed: {opponent}'
assert json.loads((run/'config.json').read_text())['generations']>=100
for name in ['training' ,'arena','holdout','promotions','tournament','inference-fixture']:
    shutil.copy(run/f'metrics/{name}.json',stage/f'metrics/{name}.json')
for name in ['config','sample-game']:
    shutil.copy(run/f'{name}.json',stage/f'metrics/{name}.json')
shutil.copytree(run/'evaluation',stage/'evaluation')
for p in (run/'checkpoints').glob('*.json'):
    if int(p.stem.removeprefix('gen-')) not in {0,5,10,20,25,50,100,150,200,champion}: continue
    shutil.copy(p,stage/'models'/p.name)
shutil.copy(run/'champion.json',stage/'models/final.json')
m['artifact_hashes']={str(p.relative_to(stage)):hashlib.sha256(p.read_bytes()).hexdigest() for p in stage.rglob('*') if p.is_file()}
(stage/'metrics/run-metadata.json').write_text(json.dumps(m,indent=2))
subprocess.run(['python3',str(root/'scripts/validate-published-run.py'),str(stage)],check=True)
for name in ['models','metrics','evaluation']:
    dest=root/'web'/name
    if dest.exists():shutil.rmtree(dest)
    shutil.copytree(stage/name,dest)
