"""Periodic C2 cubic with sampled feasibility scaling; pure Python, no backend."""
import json, math
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def solve(matrix, rhs):
    n=len(rhs)
    for i in range(n):
        pivot=matrix[i][i]
        for j in range(i,n): matrix[i][j]/=pivot
        rhs[i]/=pivot
        for k in range(n):
            if k==i: continue
            factor=matrix[k][i]
            for j in range(i,n): matrix[k][j]-=factor*matrix[i][j]
            rhs[k]-=factor*rhs[i]
    return rhs

def build(points,h):
    n=len(points);segments=[[] for _ in points]
    for axis in range(3):
        p=[v[axis] for v in points];matrix=[[0.]*n for _ in points]
        for i in range(n):
            matrix[i][i]=4*h;matrix[i][(i-1)%n]=h;matrix[i][(i+1)%n]=h
        m=solve(matrix,[6*(p[(i+1)%n]-2*p[i]+p[(i-1)%n])/h for i in range(n)])
        for i in range(n):
            j=(i+1)%n
            segments[i].append([p[i],(p[j]-p[i])/h-h*(2*m[i]+m[j])/6,m[i]/2,(m[j]-m[i])/(6*h)])
    return {'format':'periodic-cubic-v2','duration':h*n,'segmentDuration':h,'coefficients':segments,'generator':'periodic C2 spline with sampled feasibility scaling; not time optimal'}

def evaluate(traj,t):
    t=t%traj['duration'];h=traj['segmentDuration'];i=min(int(t/h),len(traj['coefficients'])-1);s=t-i*h
    rows=traj['coefficients'][i]
    return ([c[0]+s*(c[1]+s*(c[2]+s*c[3])) for c in rows],[c[1]+s*(2*c[2]+3*s*c[3]) for c in rows],[2*c[2]+6*s*c[3] for c in rows])

def feasibility(traj):
    speed=acc=tilt=thrust=0
    for j in range(math.ceil(traj['duration']/.01)+1):
        _,v,a=evaluate(traj,j*.01)
        speed=max(speed,math.hypot(*v));acc=max(acc,math.hypot(*a))
        az=a[2]+9.81;tilt=max(tilt,math.degrees(math.atan2(math.hypot(*a[:2]),az)))
        thrust=max(thrust,.65*math.hypot(a[0],a[1],az))
    return {'maxSpeed':speed,'maxAcceleration':acc,'maxTiltDegrees':tilt,'maxCollectiveThrust':thrust}

if __name__=='__main__':
    course=json.loads((ROOT/'course.json').read_text());points=[g['position'] for g in course['gates']];h=.8
    while True:
        traj=build(points,h);metrics=feasibility(traj)
        if metrics['maxSpeed']<=7 and metrics['maxAcceleration']<=5.8 and metrics['maxTiltDegrees']<=34:break
        h+=.025
    traj['feasibility']=metrics
    (ROOT/'trajectories/race_v1.json').write_text(json.dumps(traj,indent=2)+'\n')
    p,v,_=evaluate(traj,course['referenceOffset'])
    course['spawn']={'position':p,'yaw':math.atan2(v[1],v[0])}
    # Orient openings to the exact racing-line tangent at each center.
    for i,g in enumerate(course['gates']):
        _,v,_=evaluate(traj,i*h);g['yaw']=math.atan2(v[1],v[0])
    (ROOT/'course.json').write_text(json.dumps(course,indent=2)+'\n')
    print(json.dumps({'duration':traj['duration'],**metrics},indent=2))
