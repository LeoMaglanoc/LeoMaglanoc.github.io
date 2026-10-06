import { G1RLMode } from './modes/g1-rl-mode.js';
import { B2Z1MPCMode } from './modes/b2z1-mpc-mode.js';
let mode, generation = 0;
const container = document.getElementById('simulation');
async function select(name) {
  const token = ++generation;
  history.replaceState(null,'',`#${name}`);
  mode?.dispose();
  container.replaceChildren();
  for (const id of ['g1', 'b2']) document.getElementById(`mode-${id}`).setAttribute('aria-pressed', String(id === name));
  document.getElementById('explanation').textContent = name === 'g1'
    ? 'G1: state → neural PPO policy → desired joint positions → PD torques → MuJoCo → next state. The learned policy executes live in your browser.'
    : 'B2+Z1: state + model + objectives + constraints → optimize future motion → execute first action → repeat. Recorded native Fatrop MPC replays genuine upstream solves. Live mode solves the same whole-body problem with browser IPOPT and MuJoCo feedback; torque replay separately tests physics transfer.';
  const next = name === 'g1' ? new G1RLMode() : new B2Z1MPCMode();
  mode = next;
  try { await next.init(container); if (token !== generation) next.dispose(); }
  catch (error) {
    if (token !== generation) return;
    next.dispose();
    const message = document.createElement('p'); message.className = 'error'; message.setAttribute('role','alert'); message.textContent = `Simulation could not load: ${error.message}. Select a mode to retry.`; container.replaceChildren(message);
  }
}
document.getElementById('mode-g1').addEventListener('click', () => select('g1'));
document.getElementById('mode-b2').addEventListener('click', () => select('b2'));
document.getElementById('about-toggle').addEventListener('click', (event) => {
  const panel = document.getElementById('about'); panel.hidden = !panel.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
});
select(location.hash==='#b2'?'b2':'g1');
