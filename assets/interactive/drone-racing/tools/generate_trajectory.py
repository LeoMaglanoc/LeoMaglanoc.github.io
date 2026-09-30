"""Offline clamped C2 cubic spline + deterministic time scaling. No JAX in browser.
Crazyflow cf2x_L250 reference: mass=.029 kg, arm=.03253 m, max thrust=.12 N/rotor.
Polynomial order ascending; derivatives in SI units. Not time-optimal optimization.
"""
import json, math
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def build(points, h):
    segments = [[] for _ in range(len(points)-1)]
    for axis in range(3):
        p = [v[axis] for v in points]; n = len(p)
        # Clamped zero velocity at both ends; solve tridiagonal system for second derivatives.
        diag = [2*h] + [4*h]*(n-2) + [2*h]
        rhs = [6*(p[1]-p[0])/h] + [6*(p[i+1]-2*p[i]+p[i-1])/h for i in range(1,n-1)] + [-6*(p[-1]-p[-2])/h]
        for i in range(1,n):
            factor = h/diag[i-1]; diag[i] -= factor*h; rhs[i] -= factor*rhs[i-1]
        m = [0]*n; m[-1] = rhs[-1]/diag[-1]
        for i in range(n-2,-1,-1): m[i] = (rhs[i]-h*m[i+1])/diag[i]
        for i in range(n-1):
            segments[i].append([p[i],(p[i+1]-p[i])/h-h*(2*m[i]+m[i+1])/6,m[i]/2,(m[i+1]-m[i])/(6*h)])
    return {"format":"clamped-cubic-v1","duration":h*(len(points)-1),"segmentDuration":h,"coefficients":segments,"generator":"offline C2 spline with feasibility time scaling; not time optimal","parameterReference":"Crazyflow cf2x_L250"}

def evaluate(traj,t):
    h=traj['segmentDuration'];i=min(int(max(t,0)/h),len(traj['coefficients'])-1);s=min(max(t-i*h,0),h)
    rows=traj['coefficients'][i]
    return ([c[0]+s*(c[1]+s*(c[2]+s*c[3])) for c in rows], [c[1]+s*(2*c[2]+3*s*c[3]) for c in rows], [2*c[2]+6*s*c[3] for c in rows])

def feasibility(traj):
    speed=acc=tilt=thrust=0
    for j in range(math.ceil(traj['duration']/.01)+1):
        _,v,a=evaluate(traj,min(j*.01,traj['duration']))
        speed=max(speed,math.hypot(*v));acc=max(acc,math.hypot(*a))
        az=a[2]+9.81;tilt=max(tilt,math.degrees(math.atan2(math.hypot(*a[:2]),az)))
        thrust=max(thrust,.029*math.hypot(a[0],a[1],az))
    return {"maxSpeed":speed,"maxAcceleration":acc,"maxTiltDegrees":tilt,"maxCollectiveThrust":thrust}

if __name__=='__main__':
    course=json.loads((ROOT/'course.json').read_text());points=[course['start']]+course['gates']+[course['finish']]
    h=1.35
    while True:
        traj=build(points,h);metrics=feasibility(traj)
        if metrics['maxSpeed']<=4 and metrics['maxAcceleration']<=6 and metrics['maxTiltDegrees']<=32 and metrics['maxCollectiveThrust']<=.4:break
        h+=.05
    traj['feasibility']=metrics
    (ROOT/'trajectories/race_v1.json').write_text(json.dumps(traj,indent=2)+'\n')
    print(json.dumps({"duration":traj['duration'],**metrics},indent=2))
