use rustzero::{
    game::Position,
    mcts::{Search, Uniform},
};
fn main() {
    let mut p = Position::default();
    while p.terminal().is_none() {
        println!("{:?}\nlegal canonical actions: {:?}", p.board(), p.legal());
        if !p.side {
            let mut s = String::new();
            std::io::stdin().read_line(&mut s).unwrap();
            match s.trim().parse::<usize>().ok().and_then(|a| p.play(a).ok()) {
                Some(n) => p = n,
                None => println!("Enter a legal action ID"),
            }
        } else {
            let mut search = Search::new(p, &Uniform, 1.5);
            search.run(&Uniform, 64);
            p = p.play(search.best().unwrap()).unwrap()
        }
    }
    println!("Result from side to move: {:?}", p.terminal());
}
