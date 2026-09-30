import json, math
from generate_trajectory import ROOT, evaluate, feasibility
c=json.loads((ROOT/'course.json').read_text());t=json.loads((ROOT/'trajectories/race_v1.json').read_text())
for i,point in enumerate([c['start']]+c['gates']+[c['finish']]):
    p,v,a=evaluate(t,i*t['segmentDuration']);assert math.dist(p,point)<1e-8
    if i in (0,len(t['coefficients'])):assert math.hypot(*v)<1e-8
    if 0<i<len(t['coefficients']):
        left=evaluate(t,i*t['segmentDuration']-1e-7)
        assert math.dist(left[1],v)<1e-5 and math.dist(left[2],a)<1e-5
m=feasibility(t);assert m['maxSpeed']<=4 and m['maxAcceleration']<=6 and m['maxTiltDegrees']<=32 and m['maxCollectiveThrust']<=.4
assert 8<=t['duration']<=20
print('Trajectory gate centers, endpoint velocities, C2 continuity and feasibility passed:',m)
