#[cfg(feature = "training")]
fn main() {
    use rustzero::training::*;
    let dir = std::env::args().nth(1).unwrap();
    let weights: rustzero::model::Weights =
        serde_json::from_str(&std::fs::read_to_string(format!("{dir}/champion.json")).unwrap())
            .unwrap();
    let mut generations = vec![0, 20, 50, 100, 150, 200, weights.generation];
    generations.sort_unstable();
    generations.dedup();
    generations
        .retain(|g| std::path::Path::new(&format!("{dir}/checkpoints/gen-{g}.json")).exists());
    let nets: Vec<_> = generations
        .iter()
        .map(|g| load_net(&format!("{dir}/checkpoints/gen-{g}.json")))
        .collect();
    let mut scores = vec![0; nets.len()];
    let mut matches = vec![];
    for i in 0..nets.len() {
        for j in i + 1..nets.len() {
            let r = arena(
                &nets[i],
                generations[i],
                Opponent::Checkpoint(&nets[j]),
                &format!("gen-{}", generations[j]),
                200,
                256,
                90210,
                1.5,
            );
            scores[i] += r.wins;
            scores[j] += r.losses;
            println!(
                "tournament {} vs {}: {}/{}",
                generations[i], generations[j], r.wins, r.games
            );
            matches.push(r);
        }
    }
    let best = (0..nets.len()).max_by_key(|&i| scores[i]).unwrap();
    std::fs::copy(
        format!("{dir}/checkpoints/gen-{}.json", generations[best]),
        format!("{dir}/champion.json"),
    )
    .unwrap();
    save_json(
        format!("{dir}/metrics/tournament.json"),
        &serde_json::json!({"generations":generations,"scores":scores,"champion":generations[best],"matches":matches,"seed":90210}),
    );
}
#[cfg(not(feature = "training"))]
fn main() {}
