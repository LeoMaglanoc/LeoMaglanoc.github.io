import { CONFIG as C } from './config.js';
import { ik, stepRobot } from './robot.js';
import { validPrediction } from './predictors.js';
export function control(q, prediction, now, mode, c = C) {
  if (!validPrediction(prediction, now, mode)) return { q: [...q], status: prediction ? 'expired' : 'warming', projected: false };
  const desired = ik(prediction.predictedPosition, q, c);
  return { q: stepRobot(q, desired.q, c.dt, c), status: 'tracking', projected: desired.projected };
}
