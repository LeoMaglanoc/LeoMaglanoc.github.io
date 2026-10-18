"""Aggregate saved forecasts without rerunning the model (standard library only)."""
import gzip, json, math, statistics
from pathlib import Path
OUT=Path(__file__).resolve().parents[1]/'results'
def summary(a):
    a=sorted(a)
    return {'n':len(a),'mean':statistics.fmean(a),'median':statistics.median(a),'p95':a[math.ceil(.95*len(a))-1]} if a else {'n':0}
def main():
    fixtures={f['id']:f for f in json.loads((OUT/'fixtures.json').read_text())['fixtures']}
    with gzip.open(OUT/'timestral-predictions.json.gz','rt') as f: ml=json.load(f)
    with gzip.open(OUT/'baseline-predictions.json.gz','rt') as f: baselines=json.load(f)
    records=[]
    for item in baselines:
        records.extend({**p,'fixture':item['fixture']} for p in item['predictions'])
    records.extend(ml['records'])
    metrics=[]
    for model in ['reactive','velocity','timestral']:
        for kind in ['all','straight','circle','figure-eight','reversal','stop-go']:
            selected=[p for p in records if p['modelName']==model and (kind=='all' or fixtures[p['fixture']]['kind']==kind)]
            errors=[];latencies=[];ids=set();inside=[0,0];tolerant=[0,0]
            for p in selected:
                assert p['sourceObservationTime']<=p['generatedAt']-.1+1e-8
                assert abs(p['targetTime']-p['sourceObservationTime']-.3)<1e-8
                latencies.append(p['latencyMs']);f=fixtures[p['fixture']];ids.add(f['id'])
                if p['targetTime']>f['events'][-1]['t']+1e-9:continue
                truth=f['events'][min(len(f['events'])-1,math.floor((p['targetTime']+1e-8)*30))]
                errors.append(math.hypot(p['predictedPosition']['x']-truth['x'],p['predictedPosition']['y']-truth['y']))
                if model=='timestral':
                    assert len(p['rawQuantiles'])==2 and len(p['rawQuantiles'][0])==9 and len(p['rawQuantiles'][0][0])==21
                    for j,key in enumerate(['x','y']):
                        lo=p['rawQuantiles'][j][8][ml['quantileLevels'].index(.05)];hi=p['rawQuantiles'][j][8][ml['quantileLevels'].index(.95)]
                        inside[j]+=lo<=truth[key]<=hi;tolerant[j]+=lo-1e-6<=truth[key]<=hi+1e-6
            row={'model':model,'movement':kind,'independentTrajectories':len(ids),'errorAt300msWorldUnits':summary(errors),'latencyMs':summary(latencies)}
            if model=='timestral':row['marginal90Coverage']={'x':inside[0]/len(errors),'y':inside[1]/len(errors),'xTolerance1eMinus6':tolerant[0]/len(errors),'yTolerance1eMinus6':tolerant[1]/len(errors),'note':'Strict and numerical-tolerance marginal coverage. Not joint 2D coverage; constant-coordinate collapsed intervals are sensitive to float32 rounding.'}
            metrics.append(row)
    (OUT/'forecast-metrics.json').write_text(json.dumps({'units':'normalized world units, milliseconds','humanTrajectories':0,'metrics':metrics},indent=2)+'\n')
    for r in metrics:
        if r['movement']=='all':print(r)
if __name__=='__main__':main()
