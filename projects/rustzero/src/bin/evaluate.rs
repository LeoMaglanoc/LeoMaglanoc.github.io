#[cfg(feature = "training")]
fn main() {
    use rustzero::training::*;
    let args: Vec<_> = std::env::args().collect();
    let dir = &args[1];
    let out = &args[2];
    let mut results = vec![];
    for generation in [0, 2, 4, 8, 15] {
        let net = load_net(&format!("{dir}/checkpoints/gen-{generation}.json"));
        for sims in [1, 64] {
            for (opp, name) in [
                (Opponent::Random, "random"),
                (Opponent::Heuristic, "heuristic"),
            ] {
                let r = arena(&net, generation, opp, name, 200, sims, 78123, 1.5);
                println!(
                    "gen {generation}, {sims} sims, {name}: {}/{}",
                    r.wins, r.games
                );
                results.push(r)
            }
        }
        let initial = load_net(&format!("{dir}/checkpoints/gen-0.json"));
        results.push(arena(
            &net,
            generation,
            Opponent::Checkpoint(&initial),
            "gen-0",
            200,
            64,
            78123,
            1.5,
        ));
    }
    let final_net = load_net(&format!("{dir}/checkpoints/gen-15.json"));
    for generation in [2, 4, 8] {
        let historical = load_net(&format!("{dir}/checkpoints/gen-{generation}.json"));
        results.push(arena(
            &final_net,
            15,
            Opponent::Checkpoint(&historical),
            &format!("gen-{generation}"),
            200,
            64,
            78123,
            1.5,
        ));
    }
    save_json(out, &results);
}
#[cfg(not(feature = "training"))]
fn main() {}
