#[cfg(feature = "training")]
fn main() {
    use rustzero::{
        game::Position,
        mcts::Evaluator,
        training::{load_net, save_json},
    };
    let args: Vec<_> = std::env::args().collect();
    let n = load_net(&args[1]);
    let mut p = Position::default();
    let mut rows = vec![];
    for _ in 0..6 {
        let (policy, value) = n.evaluate(&p);
        rows.push(serde_json::json!({"actions":p.legal(),"policy":policy.to_vec(),"value":value}));
        p = p.play(p.legal()[0]).unwrap();
    }
    save_json(&args[2], &rows);
}
#[cfg(not(feature = "training"))]
fn main() {}
