"""Independent saved-window causality and official-output contract audit."""
import bisect,gzip,hashlib,json,math
from pathlib import Path
OUT=Path(__file__).resolve().parents[1]/'results'
def main():
    fixtures={f['id']:f['events'] for f in json.loads((OUT/'fixtures.json').read_text())['fixtures']}
    windows=json.loads((OUT/'windows.json').read_text())['windows']
    with gzip.open(OUT/'timestral-predictions.json.gz','rt') as f: data=json.load(f)
    assert len(windows)==len(data['records'])==1485
    checks=0
    for w,p in zip(windows,data['records']):
        assert w['fixture']==p['fixture'] and w['sourceObservationTime']==p['sourceObservationTime']
        assert w['sourceObservationTime']<=w['generatedAt']-.1+1e-8
        events=fixtures[w['fixture']];times=[e['t'] for e in events]
        assert len(w['sampleTimes'])==64
        for i,t in enumerate(w['sampleTimes']):
            assert t<=w['sourceObservationTime']+1e-8
            j=bisect.bisect_right(times,t+1e-10)-1;assert j>=0
            for axis,key in enumerate(['x','y']):assert abs(w['context'][axis][i]-events[j][key])<1e-10
            checks+=1
        q=p['rawQuantiles'];assert len(q)==2
        for axis in q:
            assert len(axis)==9
            for row in axis:
                assert len(row)==21 and all(math.isfinite(x) for x in row)
                assert all(a<=b+1e-7 for a,b in zip(row,row[1:]))
        median=[q[axis][8][data['quantileLevels'].index(.5)] for axis in range(2)];norm=math.hypot(*median);scale=min(1,.87/norm) if norm else 1
        for i,key in enumerate(['x','y']):assert abs(median[i]*scale-p['predictedPosition'][key])<1e-7
    provenance=json.loads((OUT/'timestral-provenance.json').read_text())
    for filename,key in [('fixtures.json','fixtureSha256'),('windows.json','windowSha256')]:assert hashlib.sha256((OUT/filename).read_bytes()).hexdigest()==provenance[key]
    result={'status':'passed','windows':len(windows),'causalSampleChecks':checks,'quantileShapes':[1,2,9,21],'violations':0,'checks':'independent causal zero-order hold against original fixture events; timestamps; all raw quantile shapes, finiteness and ordering; clipped median targets; input hashes'}
    (OUT/'audit.json').write_text(json.dumps(result,indent=2)+'\n');print(result)
if __name__=='__main__':main()
