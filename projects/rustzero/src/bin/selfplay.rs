fn main() {
    let args: Vec<_> = std::env::args().collect();
    let cfg = rustzero::training::Config::load("configs/debug.toml");
    let net = rustzero::training::load_net(args.get(1).expect("selfplay CHECKPOINT"));
    use rand::SeedableRng;
    let (e, m) = rustzero::training::selfplay(
        &net,
        &cfg,
        &mut rand::rngs::SmallRng::seed_from_u64(cfg.seed),
    );
    println!("{} examples, moves: {:?}", e.len(), m);
}
