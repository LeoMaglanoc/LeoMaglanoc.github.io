use rustzero::training::*;
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let path = args
        .get(1)
        .expect("arena CHECKPOINT [GAMES] [SIMULATIONS] [OUTPUT]");
    let games = args.get(2).map(|s| s.parse().unwrap()).unwrap_or(200);
    let sims = args.get(3).map(|s| s.parse().unwrap()).unwrap_or(64);
    let net = load_net(path);
    let w: rustzero::model::Weights =
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let mut results = vec![];
    for (opp, name) in [
        (Opponent::Random, "random"),
        (Opponent::Heuristic, "heuristic"),
    ] {
        results.push(arena(
            &net,
            w.generation,
            opp,
            name,
            games,
            sims,
            78123,
            1.5,
        ));
    }
    if let Some(p) = args.get(4) {
        save_json(p, &results)
    }
    println!("{}", serde_json::to_string_pretty(&results).unwrap());
}
