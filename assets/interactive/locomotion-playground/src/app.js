import { G1RLMode } from './modes/g1-rl-mode.js';
let mode, generation = 0;
const container = document.getElementById('simulation');
async function select() {
  const token = ++generation;
  history.replaceState(null, '', '#g1');
  mode?.dispose();
  container.replaceChildren();
  const next = new G1RLMode();
  mode = next;
  try { await next.init(container); if (token !== generation) next.dispose(); }
  catch (error) {
    if (token !== generation) return;
    next.dispose();
    const message = document.createElement('p'); message.className = 'error'; message.setAttribute('role','alert'); message.textContent = `Simulation could not load: ${error.message}. Select G1 to retry.`; container.replaceChildren(message);
  }
}
document.getElementById('mode-g1').addEventListener('click', () => select());
document.getElementById('about-toggle').addEventListener('click', (event) => {
  const panel = document.getElementById('about'); panel.hidden = !panel.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
});
// MPC implementation is retained, but public entry points always launch G1.
select();
