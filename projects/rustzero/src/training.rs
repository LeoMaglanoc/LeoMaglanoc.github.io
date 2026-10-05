use crate::{
    game::{Position, mirror_action},
    mcts::{Evaluator, Search, heuristic_action},
    model::{Cpu, Network, Weights},
};
use burn::{
    backend::Autodiff,
    module::AutodiffModule,
    optim::{AdamConfig, GradientsParams, Optimizer},
    prelude::*,
};
use rand::{Rng, SeedableRng, rngs::SmallRng};
use serde::{Deserialize, Serialize};
use std::{collections::VecDeque, fs, path::Path, time::Instant};
pub type TrainBackend = Autodiff<Cpu>;
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Config {
    pub seed: u64,
    pub generations: usize,
    pub games: usize,
    pub simulations: usize,
    pub steps: usize,
    pub batch: usize,
    pub replay_capacity: usize,
    pub learning_rate: f64,
    pub c_puct: f32,
    pub temperature_moves: usize,
    pub noise_alpha: f32,
    pub noise_fraction: f32,
    pub arena_games: usize,
    pub arena_simulations: usize,
}
impl Config {
    pub fn load(path: &str) -> Self {
        let c: Self = toml::from_str(&fs::read_to_string(path).unwrap()).unwrap();
        assert!(
            c.simulations > 0
                && c.steps > 0
                && c.batch > 0
                && c.games > 0
                && c.replay_capacity > 0
                && c.arena_simulations > 0
                && c.arena_games > 0
                && c.arena_games.is_multiple_of(2)
        );
        assert!(
            c.learning_rate > 0.
                && c.c_puct > 0.
                && c.noise_alpha > 0.
                && (0. ..=1.).contains(&c.noise_fraction)
        );
        c
    }
}
#[derive(Clone)]
pub struct Example {
    pub state: [f32; 72],
    pub policy: [f32; 108],
    pub outcome: f32,
}
pub fn selfplay(
    net: &impl Evaluator,
    cfg: &Config,
    rng: &mut SmallRng,
) -> (Vec<Example>, Vec<usize>) {
    let mut p = Position::default();
    let mut history = vec![];
    let mut moves = vec![];
    while p.terminal().is_none() {
        let mut search = Search::new(p, net, cfg.c_puct);
        if cfg.noise_fraction > 0. {
            search.noise(rng, cfg.noise_alpha, cfg.noise_fraction)
        }
        search.run(net, cfg.simulations);
        let stats = search.stats();
        let mut policy = [0.; 108];
        for s in &stats {
            policy[s.action] = s.probability
        }
        history.push((p, policy));
        let a = if moves.len() < cfg.temperature_moves {
            let u = rng.gen_range(0.0f32..1.);
            let mut sum = 0.;
            stats
                .iter()
                .find(|s| {
                    sum += s.probability;
                    sum >= u
                })
                .unwrap_or(stats.last().unwrap())
                .action
        } else {
            search.best().unwrap()
        };
        moves.push(a);
        p = p.play(a).unwrap();
        assert!(moves.len() < 200, "Breakthrough must terminate")
    }
    let winning_side = if p.terminal() == Some(1.) {
        p.side
    } else {
        !p.side
    };
    let examples = history
        .into_iter()
        .flat_map(|(state, policy)| {
            let outcome = if state.side == winning_side { 1. } else { -1. };
            let mut mirrored = [0.; 108];
            for a in 0..108 {
                mirrored[mirror_action(a)] = policy[a]
            }
            [
                Example {
                    state: state.encode(),
                    policy,
                    outcome,
                },
                Example {
                    state: state.mirrored().encode(),
                    policy: mirrored,
                    outcome,
                },
            ]
        })
        .collect();
    (examples, moves)
}
pub fn loss<B: Backend>(
    net: &Network<B>,
    examples: &[Example],
    d: &B::Device,
) -> (Tensor<B, 1>, Tensor<B, 1>, Tensor<B, 1>) {
    let b = examples.len();
    let x: Vec<f32> = examples.iter().flat_map(|e| e.state).collect();
    let pi: Vec<f32> = examples.iter().flat_map(|e| e.policy).collect();
    let z: Vec<f32> = examples.iter().map(|e| e.outcome).collect();
    let (logits, v) = net.forward(Tensor::from_data(TensorData::new(x, [b, 72]), d));
    let target = Tensor::from_data(TensorData::new(pi, [b, 108]), d);
    let values = Tensor::from_data(TensorData::new(z, [b, 1]), d);
    let pl = -(burn::tensor::activation::log_softmax(logits, 1) * target)
        .sum_dim(1)
        .mean();
    let diff = v - values;
    let vl = (diff.clone() * diff).mean();
    (pl.clone() + vl.clone(), pl, vl)
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ArenaResult {
    pub generation: usize,
    pub opponent: String,
    pub simulations: usize,
    pub games: usize,
    pub wins: usize,
    pub losses: usize,
    pub win_rate: f32,
    pub wins_as_white: usize,
    pub wins_as_black: usize,
    pub average_moves: f32,
    pub seed: u64,
}
pub enum Opponent<'a> {
    Random,
    Heuristic,
    Checkpoint(&'a Network<Cpu>),
}
#[allow(
    clippy::too_many_arguments,
    reason = "Arena results explicitly record generation, opponent and search settings"
)]
pub fn arena(
    net: &Network<Cpu>,
    generation: usize,
    opponent: Opponent,
    name: &str,
    games: usize,
    sims: usize,
    seed: u64,
    c: f32,
) -> ArenaResult {
    let mut rng = SmallRng::seed_from_u64(seed);
    let (mut wins, mut white, mut black, mut total_moves) = (0, 0, 0, 0);
    for game in 0..games {
        let net_side = game % 2 != 0;
        let mut p = Position::default();
        let mut moves = 0;
        // Two random legal opening plies diversify both sides without adding evaluator noise.
        for _ in 0..2 {
            let legal = p.legal();
            p = p.play(legal[rng.gen_range(0..legal.len())]).unwrap();
            moves += 1;
        }
        while p.terminal().is_none() {
            let a = if p.side == net_side {
                let mut s = Search::new(p, net, c);
                s.run(net, sims);
                s.best().unwrap()
            } else {
                match opponent {
                    Opponent::Random => {
                        let legal = p.legal();
                        legal[rng.gen_range(0..legal.len())]
                    }
                    Opponent::Heuristic => heuristic_action(&p),
                    Opponent::Checkpoint(other) => {
                        let mut s = Search::new(p, other, c);
                        s.run(other, sims);
                        s.best().unwrap()
                    }
                }
            };
            p = p.play(a).unwrap();
            moves += 1;
            assert!(moves < 200)
        }
        let winner = if p.terminal() == Some(1.) {
            p.side
        } else {
            !p.side
        };
        if winner == net_side {
            wins += 1;
            if net_side { black += 1 } else { white += 1 }
        }
        total_moves += moves;
    }
    ArenaResult {
        generation,
        opponent: name.into(),
        simulations: sims,
        games,
        wins,
        losses: games - wins,
        win_rate: wins as f32 / games as f32,
        wins_as_white: white,
        wins_as_black: black,
        average_moves: total_moves as f32 / games as f32,
        seed,
    }
}
#[derive(Serialize, Deserialize)]
pub struct Metric {
    pub generation: usize,
    pub global_step: usize,
    pub positions: usize,
    pub policy_loss: f32,
    pub value_loss: f32,
    pub total_loss: f32,
    pub selfplay_seconds: f64,
    pub games_per_second: f64,
    pub average_game_length: f64,
    pub training_seconds: f64,
}
pub fn save_json(path: impl AsRef<Path>, value: &impl Serialize) {
    let path = path.as_ref();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, serde_json::to_string_pretty(value).unwrap()).unwrap()
}
pub fn load_net(path: &str) -> Network<Cpu> {
    let w: Weights = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
    Network::from_weights(&w).unwrap()
}
pub fn train(cfg: Config, out: &str) {
    let device = Default::default();
    Cpu::seed(&device, cfg.seed);
    let mut rng = SmallRng::seed_from_u64(cfg.seed);
    let mut model = Network::<TrainBackend>::new(&device);
    let initial = model.valid();
    let mut previous = initial.clone();
    let mut optimizer = AdamConfig::new().init();
    let mut replay = VecDeque::new();
    let mut metrics = vec![];
    let mut arenas = vec![];
    save_json(format!("{out}/config.json"), &cfg);
    save_json(
        format!("{out}/checkpoints/gen-0.json"),
        &initial.weights(0, 0, cfg.seed),
    );
    for generation in 0..=cfg.generations {
        if generation > 0 {
            let timer = Instant::now();
            let net = model.valid();
            let mut length = 0;
            for _ in 0..cfg.games {
                let (examples, moves) = selfplay(&net, &cfg, &mut rng);
                length += moves.len();
                for e in examples {
                    replay.push_back(e);
                    if replay.len() > cfg.replay_capacity {
                        replay.pop_front();
                    }
                }
            }
            let seconds = timer.elapsed().as_secs_f64();
            let timer = Instant::now();
            let (mut policy_loss, mut value_loss, mut total_loss) = (0., 0., 0.);
            for _ in 0..cfg.steps {
                let batch: Vec<_> = (0..cfg.batch)
                    .map(|_| replay[rng.gen_range(0..replay.len())].clone())
                    .collect();
                let (total, pl, vl) = loss(&model, &batch, &device);
                total_loss += total.clone().into_scalar();
                policy_loss += pl.into_scalar();
                value_loss += vl.into_scalar();
                let grads = GradientsParams::from_grads(total.backward(), &model);
                model = optimizer.step(cfg.learning_rate, model, grads);
            }
            let m = Metric {
                generation,
                global_step: generation * cfg.steps,
                positions: replay.len(),
                policy_loss: policy_loss / cfg.steps as f32,
                value_loss: value_loss / cfg.steps as f32,
                total_loss: total_loss / cfg.steps as f32,
                selfplay_seconds: seconds,
                games_per_second: cfg.games as f64 / seconds,
                average_game_length: length as f64 / cfg.games as f64,
                training_seconds: timer.elapsed().as_secs_f64(),
            };
            println!(
                "gen {generation}: positions {} loss {:.3} selfplay {:.1}s train {:.1}s",
                m.positions, m.total_loss, seconds, m.training_seconds
            );
            metrics.push(m);
        }
        let net = model.valid();
        save_json(
            format!("{out}/checkpoints/gen-{generation}.json"),
            &net.weights(generation, generation * cfg.steps, cfg.seed),
        );
        for (opponent, name) in [
            (Opponent::Random, "random"),
            (Opponent::Heuristic, "heuristic"),
            (Opponent::Checkpoint(&initial), "gen-0"),
            (Opponent::Checkpoint(&previous), "previous"),
        ] {
            let r = arena(
                &net,
                generation,
                opponent,
                name,
                cfg.arena_games,
                cfg.arena_simulations,
                90210,
                cfg.c_puct,
            );
            println!("arena gen {generation} vs {name}: {}/{}", r.wins, r.games);
            arenas.push(r);
        }
        previous = net;
        save_json(format!("{out}/metrics/training.json"), &metrics);
        save_json(format!("{out}/metrics/arena.json"), &arenas);
    }
    let (_, sample) = selfplay(&model.valid(), &cfg, &mut rng);
    save_json(format!("{out}/sample-game.json"), &sample);
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn optimizer_overfits_and_changes_weights() {
        let d = Default::default();
        Cpu::seed(&d, 42);
        let mut n = Network::<TrainBackend>::new(&d);
        let before = n.valid().weights(0, 0, 42);
        let mut policy = [0.; 108];
        policy[19] = 1.;
        let examples = vec![
            Example {
                state: Position::default().encode(),
                policy,
                outcome: 1.
            };
            8
        ];
        let first = loss(&n, &examples, &d).0.into_scalar();
        let mut opt = AdamConfig::new().init();
        for _ in 0..80 {
            let l = loss(&n, &examples, &d).0;
            let grads = GradientsParams::from_grads(l.backward(), &n);
            n = opt.step(0.01, n, grads);
        }
        let last = loss(&n, &examples, &d).0.into_scalar();
        assert!(last < first * 0.1, "{first} -> {last}");
        assert_ne!(before.hidden_w, n.valid().weights(0, 80, 42).hidden_w);
    }
    #[test]
    fn selfplay_labels_and_mask() {
        let cfg = Config {
            seed: 1,
            generations: 1,
            games: 1,
            simulations: 8,
            steps: 1,
            batch: 8,
            replay_capacity: 1000,
            learning_rate: 0.001,
            c_puct: 1.5,
            temperature_moves: 10,
            noise_alpha: 0.3,
            noise_fraction: 0.25,
            arena_games: 2,
            arena_simulations: 8,
        };
        let net = Network::<Cpu>::new(&Default::default());
        let (e, m) = selfplay(&net, &cfg, &mut SmallRng::seed_from_u64(2));
        let mut p = Position::default();
        for (i, &a) in m.iter().enumerate() {
            let row = &e[i * 2];
            assert_eq!(row.state, p.encode());
            assert!((row.policy.iter().sum::<f32>() - 1.).abs() < 1e-5);
            for action in 0..108 {
                if !p.legal().contains(&action) {
                    assert_eq!(row.policy[action], 0.)
                }
            }
            p = p.play(a).unwrap();
        }
        let winner = if p.terminal() == Some(1.) {
            p.side
        } else {
            !p.side
        };
        assert_eq!(e[0].outcome, if winner { -1. } else { 1. });
    }
}
