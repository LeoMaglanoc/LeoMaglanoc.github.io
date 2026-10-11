//! One-ply value lookahead, without MCTS or policy-based move selection.
use crate::{game::Position, mcts::Evaluator};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Candidate {
    pub action: usize,
    /// Value from the mover's perspective, rather than the successor's side to move.
    pub q_value: f32,
    pub terminal: bool,
}
#[derive(Debug, Serialize)]
pub struct Lookahead {
    pub best: usize,
    pub value: f32,
    pub evaluations: usize,
    pub stats: Vec<Candidate>,
}

pub fn evaluate(position: Position, model: &impl Evaluator) -> Option<Lookahead> {
    let mut evaluations = 0;
    let stats: Vec<_> = position
        .legal()
        .into_iter()
        .map(|action| {
            let successor = position.apply(action);
            let terminal = successor.terminal();
            let value = terminal.unwrap_or_else(|| {
                evaluations += 1;
                model.evaluate(&successor).1
            });
            Candidate {
                action,
                q_value: -value,
                terminal: terminal.is_some(),
            }
        })
        .collect();
    // Proven wins outrank even a saturated neural estimate of +1. Ties keep the
    // first legal action, making the pure value mode deterministic.
    let best = stats.iter().reduce(|a, b| {
        let key = |c: &Candidate| (c.terminal && c.q_value == 1., c.q_value);
        if key(b) > key(a) { b } else { a }
    })?;
    Some(Lookahead {
        best: best.action,
        value: best.q_value,
        evaluations,
        stats,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    struct Mock {
        calls: Cell<usize>,
    }
    impl Evaluator for Mock {
        fn evaluate(&self, p: &Position) -> ([f32; 108], f32) {
            assert!(
                p.terminal().is_none(),
                "Terminal successors must use game rules"
            );
            self.calls.set(self.calls.get() + 1);
            // Ignore policy logits. Successor value varies by the moved pawn.
            (
                [100.; 108],
                if p.black & (1 << 23) != 0 { -0.8 } else { 0.6 },
            )
        }
    }
    #[test]
    fn negates_successor_value_for_black_and_preserves_root() {
        let p = Position {
            white: 1 << 6,
            black: 1 << 28,
            side: true,
        };
        let original = p;
        let mock = Mock {
            calls: Cell::new(0),
        };
        let result = evaluate(p, &mock).unwrap();
        assert_eq!(p, original);
        assert_eq!(p.apply(result.best).black, 1 << 23);
        assert_eq!(result.value, 0.8);
        assert!(result.stats.iter().any(|s| s.q_value == -0.6));
        assert_eq!(result.evaluations, p.legal().len());
        assert_eq!(result.evaluations, mock.calls.get());
    }
    struct Saturated;
    impl Evaluator for Saturated {
        fn evaluate(&self, p: &Position) -> ([f32; 108], f32) {
            assert!(p.terminal().is_none());
            ([0.; 108], -1.)
        }
    }
    #[test]
    fn proven_wins_override_estimated_wins_for_both_colors() {
        for side in [false, true] {
            let p = if side {
                Position {
                    white: 1 << 29,
                    black: (1 << 35) | (1 << 11),
                    side,
                }
            } else {
                Position {
                    white: (1 << 0) | (1 << 24),
                    black: 1 << 6,
                    side,
                }
            };
            let result = evaluate(p, &Saturated).unwrap();
            assert_eq!(p.apply(result.best).terminal(), Some(-1.));
            assert_eq!(result.value, 1.);
            assert!(result.evaluations < result.stats.len());
        }
    }
    #[test]
    fn no_moves_or_inference_for_terminal_position() {
        let p = Position {
            white: 1 << 30,
            black: 1 << 12,
            side: true,
        };
        assert!(evaluate(p, &Saturated).is_none());
    }
}
