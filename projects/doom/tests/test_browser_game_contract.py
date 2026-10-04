"""Static guardrails for the human-playable browser deathmatch release."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_runtime_loads_the_original_track1_map_without_network_hosting():
    app = (ROOT / "src/app.js").read_text()
    wad = ROOT / "game/deathmatch_rockets.wad"

    assert wad.exists()
    assert "deathmatch_rockets.wad" in app
    assert '"-file", GAME_FILE[0]' in app
    assert '"-deathmatch", "-warp", "01"' in app
    assert '"-host"' not in app
    assert "bridge.pk3" not in app


def test_runtime_has_no_ai_policy_dependency():
    app = (ROOT / "src/app.js").read_text()
    page = (ROOT / "index.html").read_text()
    worker = (ROOT / "doom.worker.js").read_text()

    for forbidden in ("ArnoldPolicy", "policy.js", "onnx", "observation", "q_values", "bridge-native"):
        assert forbidden.lower() not in app.lower()
    assert "ort.min.js" not in page
    assert "bridge-observation" not in worker
    assert "doom_spawn_bots" not in worker


def test_stock_worker_uses_console_addbot_and_human_input():
    app = (ROOT / "src/app.js").read_text()
    worker = (ROOT / "doom.worker.js").read_text()

    assert 'type: "console-commands"' in app
    assert 'Array(count).fill("addbot")' in app
    assert "function typeConsoleCommand(command)" in worker
    assert "function handleConsoleCommands(m)" in worker
    assert "requestPointerLock" in app
    assert "RESET MATCH" in (ROOT / "index.html").read_text()
