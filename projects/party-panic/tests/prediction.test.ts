import { expect, it } from 'vitest';
import { JumpFeedback, reconcileHeight } from '../src/prediction';
import type { Player } from '../src/protocol';
const player = { y: 0.75, vy: 0, respawns: 0 } as Player;
it('gives immediate bounded cosmetic jump response before host confirmation', () => {
    const feedback = new JumpFeedback();
    feedback.sample(player, 0, 0);
    feedback.sample(player, 1, 10);
    expect(feedback.sample(player, 1, 26)).toBeGreaterThan(0.85);
    expect(feedback.sample({ ...player, vy: 7 }, 1, 50)).toBeNull();
});
it('does not repeat an unconfirmed jump or keep predicting after 250ms', () => {
    const feedback = new JumpFeedback();
    feedback.sample(player, 0, 0);
    feedback.sample(player, 1, 10);
    const before = feedback.sample(player, 1, 50);
    expect(feedback.sample(player, 2, 50)).toBe(before);
    expect(feedback.sample(player, 2, 300)).toBeNull();
    expect(feedback.sample({ ...player, y: 2, vy: -1 }, 3, 1000)).toBeNull();
});
it('discards prediction on respawn and can reset for a new round', () => {
    const feedback = new JumpFeedback();
    feedback.sample(player, 0, 0);
    feedback.sample(player, 1, 10);
    expect(feedback.sample({ ...player, respawns: 1 }, 1, 50)).toBeNull();
    feedback.reset(4);
    feedback.sample(player, 4, 2000);
    expect(feedback.sample(player, 5, 2010)).toBe(0.75);
    expect(feedback.sample(player, 5, 2026)).toBeGreaterThan(0.85);
});

it('consumes countdown edges without creating a ghost jump or throttling a valid GO edge', () => {
    const feedback = new JumpFeedback();
    feedback.seed(player, 1);
    expect(feedback.sample(player, 1, 2000)).toBeNull();
    expect(feedback.sample(player, 2, 2010)).toBe(0.75);
    expect(feedback.sample(player, 2, 2026)).toBeGreaterThan(0.85);
    feedback.seed(player, 2);
    expect(feedback.sample(player, 2, 2030)).toBeNull();
});

it('hands a delayed confirmed jump to authority without dipping during ascent', () => {
    let rendered = 1.75;
    for (let tick = 0; tick < 12; tick++) {
        const next = reconcileHeight(rendered, 0.9 + tick * 0.07, 6 - tick * 0.3, 1 / 60);
        expect(next).toBeGreaterThanOrEqual(rendered);
        rendered = next;
    }
    for (let tick = 0; tick < 180; tick++) rendered = reconcileHeight(rendered, 0.75, 0, 1 / 60);
    expect(rendered).toBeCloseTo(0.75, 5);
});
