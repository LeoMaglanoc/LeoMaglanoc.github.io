.PHONY: build test train evaluate export parity web

build:
	docker compose build trainer

test:
	docker compose run --rm trainer python -m pytest -q

train:
	docker compose run --rm trainer python -m rl.train --timesteps $${TIMESTEPS:-150000} --seed $${SEED:-0}

evaluate:
	docker compose run --rm trainer python -m rl.evaluate --model models/pong_ppo.zip --games $${GAMES:-50}

export:
	docker compose run --rm trainer python -m rl.export_onnx --model models/pong_ppo.zip --output assets/pong/pong_policy.onnx

parity:
	docker compose run --rm trainer python onnx_parity.py --model models/pong_ppo.zip --onnx assets/pong/pong_policy.onnx

web:
	docker compose up website
