import json, math
from generate_trajectory import ROOT,evaluate,feasibility
c=json.loads((ROOT/'course.json').read_text());t=json.loads((ROOT/'trajectories/race_v1.json').read_text())
for i,g in enumerate(c['gates']):
    p,v,a=evaluate(t,i*t['segmentDuration']);assert math.dist(p,g['position'])<1e-8
    left=evaluate(t,i*t['segmentDuration']-1e-7)
    assert math.dist(left[1],v)<1e-5 and math.dist(left[2],a)<1e-5
for a,b in zip(evaluate(t,0),evaluate(t,t['duration'])):assert math.dist(a,b)<1e-8
m=feasibility(t);assert m['maxSpeed']<=7 and m['maxAcceleration']<=5.8 and m['maxTiltDegrees']<=34
print('Periodic gate centers, seam derivatives and sampled feasibility passed:',m)
