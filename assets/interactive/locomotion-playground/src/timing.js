// The 15 ms control interval does not divide the 2 ms physics step.
// Alternate 14/16 ms intervals without accumulating rounding error.
const CONTROL_DT=.015,PHYSICS_DT=.002,EPS=1e-9;
export const controlBoundary=time=>(Math.round(time/CONTROL_DT)+1)*CONTROL_DT;
export const controlReady=(physicsTime,lastSolveTime)=>physicsTime>=Math.floor(controlBoundary(lastSolveTime)/PHYSICS_DT+EPS)*PHYSICS_DT-EPS;
export const canStep=(physicsTime,targetTime)=>physicsTime+PHYSICS_DT<=targetTime+EPS;
