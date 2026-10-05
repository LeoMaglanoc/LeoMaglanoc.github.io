#[cfg(feature = "training")]
fn main() {
    use rustzero::training::*;
    let args: Vec<_> = std::env::args().collect();
    let dir = &args[1];
    let out = &args[2];
    let games = args.get(3).map(|s| s.parse().unwrap()).unwrap_or(400);
    let champion = load_net(&format!("{dir}/champion.json"));
    let w: rustzero::model::Weights =
        serde_json::from_str(&std::fs::read_to_string(format!("{dir}/champion.json")).unwrap())
            .unwrap();
    let initial = load_net(&format!("{dir}/checkpoints/gen-0.json"));
    let mut paths: Vec<_> = std::fs::read_dir(format!("{dir}/checkpoints"))
        .unwrap()
        .map(|e| e.unwrap().path())
        .collect();
    paths.sort_by_key(|p| {
        p.file_stem()
            .unwrap()
            .to_str()
            .unwrap()
            .trim_start_matches("gen-")
            .parse::<usize>()
            .unwrap()
    });
    let mut results = vec![];
    for path in paths {
        let net = load_net(path.to_str().unwrap());
        let generation = path
            .file_stem()
            .unwrap()
            .to_str()
            .unwrap()
            .trim_start_matches("gen-")
            .parse()
            .unwrap();
        if ![0, 10, 25, 50, 100, 150, 200, w.generation].contains(&generation) {
            continue;
        }
        for (opp, name) in [
            (Opponent::Random, "random"),
            (Opponent::Heuristic, "heuristic"),
            (Opponent::HeuristicMcts(256), "heuristic-mcts-256"),
        ] {
            let r = arena(&net, generation, opp, name, games, 256, 78123, 1.5);
            println!("gen {generation} vs {name}: {}/{}", r.wins, r.games);
            results.push(r);
        }
    }
    for sims in [64, 256, 512, 1024] {
        for (opp, name) in [
            (Opponent::Random, "random"),
            (Opponent::Heuristic, "heuristic"),
            (Opponent::HeuristicMcts(64), "heuristic-mcts-64"),
            (Opponent::HeuristicMcts(256), "heuristic-mcts-256"),
            (Opponent::HeuristicMcts(1024), "heuristic-mcts-1024"),
            (Opponent::Checkpoint(&initial), "gen-0"),
        ] {
            let r = arena(&champion, w.generation, opp, name, games, sims, 78123, 1.5);
            println!(
                "champion {}, {sims} sims vs {name}: {}/{}",
                w.generation, r.wins, r.games
            );
            results.push(r);
        }
    }
    let early_path = format!("{dir}/checkpoints/gen-5.json");
    if std::path::Path::new(&early_path).exists() {
        let early = load_net(&early_path);
        results.push(arena(
            &champion,
            w.generation,
            Opponent::Checkpoint(&early),
            "gen-5",
            games,
            256,
            78123,
            1.5,
        ));
    }
    save_json(out, &results);
}
#[cfg(not(feature = "training"))]
fn main() {}
