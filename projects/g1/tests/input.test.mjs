import assert from 'node:assert/strict';
import { CommandManager } from '../src/input.js';
const listeners = {};
globalThis.window = { addEventListener: (type, handler) => { listeners[type] = handler; } };
const manager = new CommandManager();
function event(code, input = false) {
  return { code, target: { matches: () => input }, prevented: false, preventDefault() { this.prevented = true; } };
}
const sliderKey = event('ArrowRight', true);
listeners.keydown(sliderKey);
assert.equal(sliderKey.prevented, false);
assert.equal(manager.keys.size, 0);
const movement = event('ArrowRight');
listeners.keydown(movement);
assert.equal(movement.prevented, true);
assert.ok(manager.keys.has('ArrowRight'));
// Releasing after focus moves into an input still clears a held movement key.
listeners.keyup(event('ArrowRight', true));
assert.equal(manager.keys.size, 0);
const button = { handlers: {}, classList: { add() {}, remove() {} }, addEventListener(type, handler) { this.handlers[type] = handler; } };
manager.bindButton(button, 'KeyW');
button.handlers.pointerdown(event('KeyW'));
assert.ok(manager.getTarget()[0] > 0);
button.handlers.pointercancel(event('KeyW'));
assert.deepEqual(manager.getTarget(), [0, 0, 0]);
console.log('Input checks passed: slider keys, focus changes, touch press and cancellation.');
