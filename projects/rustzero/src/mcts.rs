use crate::game::Position;
use rand::Rng;
use serde::Serialize;
pub trait Evaluator {
    fn evaluate(&self, p: &Position) -> ([f32; 108], f32);
}
pub struct Uniform;
impl Evaluator for Uniform {
    fn evaluate(&self, _: &Position) -> ([f32; 108], f32) {
        ([0.; 108], 0.)
    }
}
#[derive(Clone, Serialize, Debug)]
pub struct Stat {
    pub action: usize,
    pub visits: u32,
    pub probability: f32,
    pub q_value: f32,
    pub prior: f32,
}
struct Edge {
    action: usize,
    prior: f32,
    visits: u32,
    sum: f32,
    child: Option<Box<Node>>,
}
struct Node {
    position: Position,
    edges: Vec<Edge>,
    visits: u32,
}
fn expand(p: Position, eval: &impl Evaluator) -> (Node, f32) {
    let (logits, value) = eval.evaluate(&p);
    let legal = p.legal();
    let max = legal
        .iter()
        .map(|&a| logits[a])
        .fold(f32::NEG_INFINITY, f32::max);
    let total: f32 = legal.iter().map(|&a| (logits[a] - max).exp()).sum();
    let edges = legal
        .into_iter()
        .map(|a| Edge {
            action: a,
            prior: (logits[a] - max).exp() / total,
            visits: 0,
            sum: 0.,
            child: None,
        })
        .collect();
    (
        Node {
            position: p,
            edges,
            visits: 0,
        },
        value,
    )
}
fn simulate(node: &mut Node, eval: &impl Evaluator, c: f32) -> f32 {
    if let Some(v) = node.position.terminal() {
        return v;
    }
    let index = node
        .edges
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| {
            let score = |e: &Edge| {
                let q = if e.visits == 0 {
                    0.
                } else {
                    e.sum / e.visits as f32
                };
                let u = c * e.prior * ((node.visits + 1) as f32).sqrt() / (1 + e.visits) as f32;
                q + u
            };
            score(a).total_cmp(&score(b))
        })
        .unwrap()
        .0;
    let e = &mut node.edges[index];
    let child_value = if let Some(child) = &mut e.child {
        simulate(child, eval, c)
    } else {
        let p = node.position.apply(e.action);
        if let Some(v) = p.terminal() {
            v
        } else {
            let (child, v) = expand(p, eval);
            e.child = Some(Box::new(child));
            v
        }
    };
    let value = -child_value;
    e.visits += 1;
    e.sum += value;
    node.visits += 1;
    value
}
pub struct Search {
    root: Node,
    c: f32,
}
impl Search {
    pub fn new(p: Position, eval: &impl Evaluator, c: f32) -> Self {
        Self {
            root: expand(p, eval).0,
            c,
        }
    }
    /// Symmetric Dirichlet(alpha) root noise, training only.
    pub fn noise(&mut self, rng: &mut impl Rng, alpha: f32, fraction: f32) {
        fn normal(rng: &mut impl Rng) -> f32 {
            (-2. * rng.gen_range(0.000001f32..1.).ln()).sqrt()
                * (std::f32::consts::TAU * rng.gen_range(0.0f32..1.)).cos()
        }
        fn gamma(rng: &mut impl Rng, a: f32) -> f32 {
            if a < 1. {
                return gamma(rng, a + 1.) * rng.gen_range(0.000001f32..1.).powf(1. / a);
            }
            let d = a - 1. / 3.;
            let c = (9. * d).sqrt().recip();
            loop {
                let x = normal(rng);
                let v = 1. + c * x;
                if v <= 0. {
                    continue;
                }
                let v = v * v * v;
                let u = rng.gen_range(0.000001f32..1.);
                if u < 1. - 0.0331 * x.powi(4) || u.ln() < 0.5 * x * x + d * (1. - v + v.ln()) {
                    return d * v;
                }
            }
        }
        let noise: Vec<f32> = self.root.edges.iter().map(|_| gamma(rng, alpha)).collect();
        let sum: f32 = noise.iter().sum();
        for (e, n) in self.root.edges.iter_mut().zip(noise) {
            e.prior = e.prior * (1. - fraction) + fraction * n / sum
        }
    }
    pub fn run(&mut self, eval: &impl Evaluator, n: usize) {
        for _ in 0..n {
            if self.root.position.terminal().is_none() {
                simulate(&mut self.root, eval, self.c);
            }
        }
    }
    pub fn stats(&self) -> Vec<Stat> {
        let total = self.root.visits.max(1) as f32;
        self.root
            .edges
            .iter()
            .map(|e| Stat {
                action: e.action,
                visits: e.visits,
                probability: e.visits as f32 / total,
                q_value: if e.visits == 0 {
                    0.
                } else {
                    e.sum / e.visits as f32
                },
                prior: e.prior,
            })
            .collect()
    }
    pub fn best(&self) -> Option<usize> {
        self.root
            .edges
            .iter()
            .max_by_key(|e| e.visits)
            .map(|e| e.action)
    }
    pub fn value(&self) -> f32 {
        self.root.edges.iter().map(|e| e.sum).sum::<f32>() / self.root.visits.max(1) as f32
    }
}
/// Evaluation baseline only: never used to generate training labels.
pub struct HeuristicEvaluator;
impl Evaluator for HeuristicEvaluator {
    fn evaluate(&self, p: &Position) -> ([f32; 108], f32) {
        let (own, opp) = p.canonical();
        let strength = |pieces: u64| {
            let mut score = pieces.count_ones() as f32 * 2.;
            for i in 0usize..36 {
                if pieces >> i & 1 == 0 {
                    continue;
                }
                let rank = i / 6;
                score += (rank * rank) as f32 * 0.22;
                if rank == 4 {
                    score += 3.;
                }
                for d in [-7i32, -5] {
                    let j = i as i32 + d;
                    if (0..36).contains(&j)
                        && (j % 6 - i as i32 % 6).abs() == 1
                        && pieces >> j & 1 != 0
                    {
                        score += 0.4;
                    }
                }
            }
            score
        };
        let rotated_opp = (0..36).fold(0, |b, i| b | ((opp >> i & 1) << (35 - i)));
        (
            [0.; 108],
            ((strength(own) - strength(rotated_opp)) / 10.).tanh(),
        )
    }
}
pub fn heuristic_action(p: &Position) -> usize {
    p.legal()
        .into_iter()
        .max_by(|&a, &b| {
            let score = |a| {
                let next = p.apply(a);
                if next.terminal() == Some(-1.) {
                    return 10000.;
                }
                let (own, opp) = next.canonical();
                let (s, t) = p.squares(a);
                let progress = if p.side { 5 - t / 6 } else { t / 6 };
                let capture = if p.side {
                    p.white >> t & 1
                } else {
                    p.black >> t & 1
                };
                let protected = {
                    let cs = if p.side { 35 - t } else { t };
                    let own_before = p.canonical().0;
                    [-7i32, -5].iter().any(|&d| {
                        let x = cs as i32 + d;
                        (0..36).contains(&x)
                            && (x % 6 - cs as i32 % 6).abs() == 1
                            && own_before >> x & 1 != 0
                    })
                };
                progress as f32 * 2.
                    + capture as f32 * 4.
                    + if protected { 1. } else { 0. }
                    + (opp.count_ones() as f32 - own.count_ones() as f32) * 0.1
                    + (s % 6) as f32 * 0.001
            };
            score(a).total_cmp(&score(b))
        })
        .unwrap()
}
#[cfg(test)]
mod tests {
    use super::*;
    struct StrongPriorEvaluator;
    impl Evaluator for StrongPriorEvaluator {
        fn evaluate(&self, p: &Position) -> ([f32; 108], f32) {
            let legal = p.legal();
            let mut logits = [0.; 108];
            if let Some(&a) = legal.first() {
                logits[a] = (0.9 * (legal.len() - 1) as f32 / 0.1).ln();
            }
            (logits, 0.)
        }
    }
    #[test]
    fn unvisited_edges_retain_prior() {
        let p = Position::default();
        let mut s = Search::new(p, &StrongPriorEvaluator, 1.5);
        s.run(&StrongPriorEvaluator, 1);
        assert_eq!(s.best(), Some(p.legal()[0]));
        s.run(&StrongPriorEvaluator, 15);
        let stats = s.stats();
        assert!(stats[0].visits > stats.iter().skip(1).map(|e| e.visits).max().unwrap());
        assert_eq!(stats.iter().map(|e| e.visits).sum::<u32>(), 16);
    }
    #[test]
    fn tactical_value_overrides_prior() {
        // One pawn can win immediately; the high-prior pawn is still on its home rank.
        let p = Position {
            white: (1 << 0) | (1 << 24),
            black: 1 << 6,
            side: false,
        };
        let mut s = Search::new(p, &StrongPriorEvaluator, 1.5);
        s.run(&StrongPriorEvaluator, 512);
        assert_eq!(p.apply(s.best().unwrap()).terminal(), Some(-1.));
    }
    #[test]
    fn three_ply_forced_win_sign() {
        let p = Position {
            white: 1 << 18,
            black: 1 << 23,
            side: false,
        };
        let mut s = Search::new(p, &Uniform, 1.5);
        s.run(&Uniform, 1024);
        assert!(s.value() > 0.9, "{}", s.value());
        assert_eq!(p.apply(s.best().unwrap()).terminal(), None);
    }
    #[test]
    fn visits_and_determinism() {
        let p = Position::default();
        let mut s = Search::new(p, &Uniform, 1.5);
        s.run(&Uniform, 64);
        assert_eq!(s.stats().iter().map(|x| x.visits).sum::<u32>(), 64);
        assert!(p.legal().contains(&s.best().unwrap()));
        let mut other = Search::new(p, &Uniform, 1.5);
        other.run(&Uniform, 64);
        assert_eq!(s.best(), other.best());
        assert!((s.stats().iter().map(|x| x.probability).sum::<f32>() - 1.).abs() < 1e-5);
    }
    #[test]
    fn two_ply_loss_sign() {
        let p = Position {
            white: 1 << 22,
            black: 1 << 6,
            side: false,
        };
        let mut s = Search::new(p, &Uniform, 1.5);
        s.run(&Uniform, 256);
        assert!(s.value() < -0.8, "{}", s.value());
    }
    #[test]
    fn forced_win_and_sign() {
        let p = Position {
            white: 1 << 24,
            black: 1 << 8,
            side: false,
        };
        let mut s = Search::new(p, &Uniform, 1.5);
        s.run(&Uniform, 32);
        assert_eq!(p.apply(s.best().unwrap()).terminal(), Some(-1.));
        assert!(s.value() > 0.9);
        let terminal = p.apply(s.best().unwrap());
        let mut t = Search::new(terminal, &Uniform, 1.5);
        t.run(&Uniform, 32);
        assert_eq!(t.best(), None);
    }
}
