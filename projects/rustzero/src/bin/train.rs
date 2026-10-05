fn main() {
    let args: Vec<_> = std::env::args().collect();
    rustzero::training::train(
        rustzero::training::Config::load(
            args.get(1)
                .map(String::as_str)
                .unwrap_or("configs/debug.toml"),
        ),
        args.get(2).map(String::as_str).unwrap_or("artifacts/debug"),
    );
}
