//! Squares are row-major, row zero at White's home rank. White moves toward row 5.
//! Actions always index the canonical board, rotated 180 degrees for Black.
use serde::{Deserialize, Serialize};
pub const ACTIONS: usize = 108;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Position {
    pub white: u64,
    pub black: u64,
    pub side: bool,
}
impl Default for Position {
    fn default() -> Self {
        Self {
            white: 0xfff,
            black: 0xfff << 24,
            side: false,
        }
    }
}
pub fn flip(s: usize) -> usize {
    35 - s
}
pub fn mirror_action(a: usize) -> usize {
    ((a / 3) / 6 * 6 + 5 - (a / 3) % 6) * 3 + 2 - a % 3
}
impl Position {
    pub fn canonical(&self) -> (u64, u64) {
        if !self.side {
            (self.white, self.black)
        } else {
            let rotate = |b: u64| (0..36).fold(0, |acc, i| acc | ((b >> i & 1) << flip(i)));
            (rotate(self.black), rotate(self.white))
        }
    }
    pub fn encode(&self) -> [f32; 72] {
        let (own, opp) = self.canonical();
        std::array::from_fn(|i| {
            if i < 36 {
                (own >> i & 1) as f32
            } else {
                (opp >> (i - 36) & 1) as f32
            }
        })
    }
    /// Terminal value is always from the side-to-move perspective.
    pub fn terminal(&self) -> Option<f32> {
        let white_wins = self.white & (0x3f << 30) != 0 || self.black == 0;
        let black_wins = self.black & 0x3f != 0 || self.white == 0;
        if white_wins {
            Some(if self.side { -1. } else { 1. })
        } else if black_wins {
            Some(if self.side { 1. } else { -1. })
        } else if self.raw_legal().is_empty() {
            Some(-1.)
        } else {
            None
        }
    }
    fn raw_legal(&self) -> Vec<usize> {
        let (own, opp) = self.canonical();
        let mut moves = Vec::with_capacity(36);
        for s in 0..30 {
            if own >> s & 1 == 0 {
                continue;
            }
            for d in 0..3 {
                let x = (s % 6) as i32 + d as i32 - 1;
                if !(0..6).contains(&x) {
                    continue;
                }
                let t = (s / 6 + 1) * 6 + x as usize;
                if own >> t & 1 == 0 && (d != 1 || opp >> t & 1 == 0) {
                    moves.push(s * 3 + d)
                }
            }
        }
        moves
    }
    pub fn legal(&self) -> Vec<usize> {
        if self.terminal().is_some() {
            vec![]
        } else {
            self.raw_legal()
        }
    }
    pub fn squares(&self, a: usize) -> (usize, usize) {
        let s = a / 3;
        let t = (s as i32 + 6 + a as i32 % 3 - 1) as usize;
        if self.side {
            (flip(s), flip(t))
        } else {
            (s, t)
        }
    }
    pub fn play(&self, a: usize) -> Result<Self, String> {
        if !self.legal().contains(&a) {
            return Err("Illegal move".into());
        }
        Ok(self.apply(a))
    }
    pub(crate) fn apply(&self, a: usize) -> Self {
        let (s, t) = self.squares(a);
        let mut next = *self;
        if self.side {
            next.black = (next.black & !(1 << s)) | 1 << t;
            next.white &= !(1 << t)
        } else {
            next.white = (next.white & !(1 << s)) | 1 << t;
            next.black &= !(1 << t)
        }
        next.side = !self.side;
        next
    }
    pub fn mirrored(&self) -> Self {
        let m = |b: u64| (0..36).fold(0, |acc, i| acc | ((b >> i & 1) << (i / 6 * 6 + 5 - i % 6)));
        Self {
            white: m(self.white),
            black: m(self.black),
            side: self.side,
        }
    }
    pub fn board(&self) -> Vec<i8> {
        (0..36)
            .rev()
            .map(|i| {
                let s = i / 6 * 6 + 5 - i % 6;
                if self.white >> s & 1 != 0 {
                    1
                } else if self.black >> s & 1 != 0 {
                    -1
                } else {
                    0
                }
            })
            .collect()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn setup() {
        let p = Position::default();
        assert_eq!(p.white.count_ones(), 12);
        assert_eq!(p.black.count_ones(), 12);
        assert_eq!(p.legal().len(), 16);
    }
    #[test]
    fn rules() {
        let p = Position {
            white: 1 << 14,
            black: 1 << 21 | 1 << 20,
            side: false,
        };
        assert!(p.legal().contains(&(14 * 3 + 2)));
        assert!(!p.legal().contains(&(14 * 3 + 1)));
        assert!(p.legal().contains(&(14 * 3)));
        assert!(p.play(14 * 3 + 2).unwrap().black >> 21 & 1 == 0);
        assert!(p.play(0).is_err());
    }
    #[test]
    fn blocked_and_invalid() {
        let p = Position {
            white: (1 << 14) | (1 << 20),
            black: 1 << 35,
            side: false,
        };
        assert!(!p.legal().contains(&43));
        for a in [108, usize::MAX, 14 * 3 - 18, 14 * 3 - 3] {
            assert!(p.play(a).is_err());
        }
        let p = Position {
            white: 1 << 12,
            black: 1 << 35,
            side: false,
        };
        assert!(!p.legal().contains(&36));
        assert!(p.legal().contains(&37));
        assert!(p.legal().contains(&38));
    }
    #[test]
    fn terminal() {
        let p = Position {
            white: 1 << 24,
            black: 1 << 8,
            side: false,
        };
        let n = p.play(24 * 3 + 1).unwrap();
        assert_eq!(n.terminal(), Some(-1.));
        assert!(n.legal().is_empty());
        let p = Position {
            white: 1 << 14,
            black: 1 << 21,
            side: false,
        };
        assert_eq!(p.play(44).unwrap().terminal(), Some(-1.));
    }
    #[test]
    fn perspective() {
        let p = Position::default();
        let q = Position { side: true, ..p };
        assert_eq!(p.encode(), q.encode());
    }
    #[test]
    fn action_roundtrips() {
        for side in [false, true] {
            for a in 0..108 {
                let s = a / 3;
                if s / 6 == 5 || (a % 3 == 0 && s % 6 == 0) || (a % 3 == 2 && s % 6 == 5) {
                    continue;
                }
                let p = Position {
                    white: 1,
                    black: 1 << 35,
                    side,
                };
                let (from, to) = p.squares(a);
                let cf = if side { flip(from) } else { from };
                let ct = if side { flip(to) } else { to };
                assert_eq!(cf * 3 + (ct as i32 - cf as i32 - 5) as usize, a);
                assert_eq!(mirror_action(mirror_action(a)), a);
            }
        }
    }
    #[test]
    fn symmetry_and_invariants() {
        use rand::{Rng, SeedableRng};
        let mut rng = rand::rngs::SmallRng::seed_from_u64(3);
        for _ in 0..100 {
            let mut p = Position::default();
            for _ in 0..200 {
                let legal = p.legal();
                let mut mirrored: Vec<_> = legal.iter().map(|&a| mirror_action(a)).collect();
                mirrored.sort();
                assert_eq!(mirrored, p.mirrored().legal());
                if legal.is_empty() {
                    assert!(p.terminal().is_some());
                    break;
                }
                let n = p.play(legal[rng.gen_range(0..legal.len())]).unwrap();
                assert_eq!(n.white & n.black, 0);
                assert!(n.white.count_ones() <= p.white.count_ones());
                assert!(n.black.count_ones() <= p.black.count_ones());
                p = n;
            }
        }
    }
}
