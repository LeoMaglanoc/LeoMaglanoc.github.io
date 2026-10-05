FROM rust:1.94-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN rustup target add wasm32-unknown-unknown
RUN cargo install wasm-bindgen-cli --version 0.2.122 --locked
WORKDIR /work
ENV CARGO_TARGET_DIR=/cache/target
CMD ["cargo", "test", "--features", "training"]
RUN rustup component add rustfmt clippy
