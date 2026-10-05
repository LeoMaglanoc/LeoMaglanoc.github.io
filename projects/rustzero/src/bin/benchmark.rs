#[cfg(feature = "training")]
fn main() {
    use rustzero::{
        game::Position,
        mcts::{Evaluator, Search},
        training::load_net,
    };
    let args: Vec<_> = std::env::args().collect();
    let n = load_net(&args[1]);
    let start = std::time::Instant::now();
    for _ in 0..1000 {
        std::hint::black_box(n.evaluate(&Position::default()));
    }
    let inference = start.elapsed().as_secs_f64() / 1000.;
    let start = std::time::Instant::now();
    let mut s = Search::new(Position::default(), &n, 1.5);
    s.run(&n, 128);
    println!(
        "inference {:.3}ms; 128 simulations {:.3}ms",
        inference * 1000.,
        start.elapsed().as_secs_f64() * 1000.
    );
}
#[cfg(not(feature = "training"))]
fn main() {}
