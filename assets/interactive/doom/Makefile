COMPOSE = docker compose -f docker-compose.yml

.PHONY: build native inspect export validate benchmark test serve

build:
	$(COMPOSE) build doom-tools

native:
	$(COMPOSE) run --rm doom-tools bash tools/run_native_track1.sh

inspect:
	$(COMPOSE) run --rm doom-tools python tools/inspect_policy.py

export:
	$(COMPOSE) run --rm doom-tools python tools/export_arnold_onnx.py

validate:
	$(COMPOSE) run --rm doom-tools python tools/validate_policy.py

benchmark:
	$(COMPOSE) run --rm doom-tools python tools/benchmark_policy.py

test:
	$(COMPOSE) run --rm -e PYTHONPATH=/workspace/assets/interactive/doom/tools doom-tools pytest -q tests

serve:
	$(COMPOSE) up doom-site
