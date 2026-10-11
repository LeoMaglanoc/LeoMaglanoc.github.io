//! Paired, deterministic comparison using one checkpoint and identical openings.
use rustzero::{
    game::Position,
    lookahead,
    mcts::{Evaluator, Search},
    model::{Cpu, Network, Weights},
    training::{load_net, openings},
};
use serde::Serialize;
use std::{env, fs, time::Instant};

fn choose(p: Position, net: &Network<Cpu>, mode: &str) -> usize {
    match mode {
        "value-1ply" => lookahead::evaluate(p, net).unwrap().best,
        "policy-only" => {
            let (policy, _) = net.evaluate(&p);
            p.legal()
                .into_iter()
                .reduce(|a, b| if policy[b] > policy[a] { b } else { a })
                .unwrap()
        }
        "mcts-64" => {
            let mut search = Search::new(p, net, 1.5);
            search.run(net, 64);
            search.best().unwrap()
        }
        _ => unreachable!(),
    }
}
#[derive(Serialize)]
struct ResultRow {
    opponent: String,
    games: usize,
    wins: usize,
    losses: usize,
    wins_as_white: usize,
    wins_as_black: usize,
    value_average_move_ms: f64,
    opponent_average_move_ms: f64,
}
fn main() {
    let args: Vec<_> = env::args().collect();
    let path = args
        .get(1)
        .expect("compare-lookahead CHECKPOINT [GAMES] [OUTPUT]");
    let games: usize = args.get(2).map(|s| s.parse().unwrap()).unwrap_or(400);
    assert!(games > 0 && games.is_multiple_of(2));
    let net = load_net(path);
    let weights: Weights = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
    // New seed for this exploratory experiment, distinct from development/holdout suites.
    let seed = 20261011;
    let suite = openings(seed, games / 2);
    let mut results = Vec::new();
    for opponent in ["policy-only", "mcts-64"] {
        let (mut white, mut black) = (0, 0);
        let mut elapsed = [0.; 2];
        let mut counts = [0usize; 2];
        for game in 0..games {
            let value_side = game % 2 != 0;
            let mut p = suite[game / 2];
            let mut plies = 0;
            while p.terminal().is_none() {
                let index = usize::from(p.side != value_side);
                let start = Instant::now();
                let action = choose(p, &net, if index == 0 { "value-1ply" } else { opponent });
                elapsed[index] += start.elapsed().as_secs_f64();
                counts[index] += 1;
                p = p.play(action).unwrap();
                plies += 1;
                assert!(plies < 200);
            }
            let winner = if p.terminal() == Some(1.) {
                p.side
            } else {
                !p.side
            };
            if winner == value_side {
                if value_side { black += 1 } else { white += 1 }
            }
        }
        let row = ResultRow {
            opponent: opponent.into(),
            games,
            wins: white + black,
            losses: games - white - black,
            wins_as_white: white,
            wins_as_black: black,
            value_average_move_ms: elapsed[0] * 1000. / counts[0] as f64,
            opponent_average_move_ms: elapsed[1] * 1000. / counts[1] as f64,
        };
        eprintln!(
            "value-1ply vs {opponent}: {}/{} (White {white}, Black {black})",
            row.wins, games
        );
        results.push(row);
    }
    let report = serde_json::json!({ "generation": weights.generation, "checkpoint": path, "seed": seed,
        "opening_protocol": "paired identical positions, 2–4 legal plies, both colors; deterministic moves; no noise",
        "openings": suite, "results": results });
    let json = serde_json::to_string_pretty(&report).unwrap();
    if let Some(path) = args.get(3) {
        fs::write(path, &json).unwrap();
    }
    println!("{json}");
}
