"""Static guardrails for the deliberately small browser-engine contract.

Runtime Tests A--E require the Tomb-compatible browser build. These tests make
sure the integration cannot drift back to the failed host/network or ZScript
approach while that build is being supplied.
"""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_native_bridge_exports_only_the_required_local_contract():
    patch = (ROOT / "engine/patches/0001-browser-rl-bridge.patch").read_text()
    for name in (
        "doom_is_level_ready",
        "doom_spawn_bots",
        "doom_bot_count",
        "doom_get_health",
        "doom_get_selected_ammo",
        "doom_get_frags",
        "doom_reset_match",
    ):
        assert f"EMSCRIPTEN_KEEPALIVE int {name}" in patch
    assert "FCajunMaster::SpawnBot" not in patch
    assert "primaryLevel->BotInfo.SpawnBot(nullptr)" in patch
    assert "player->mo->health" in patch
    assert "PointerVar<AActor>(NAME_Ammo1)" in patch


def test_browser_client_has_no_network_or_zscript_bridge_path():
    app = (ROOT / "src/app.js").read_text()
    worker = (ROOT / "doom.worker.js").read_text()
    assert '"-host"' not in app
    assert "bridge.pk3" not in app
    assert "bridgeParseState" not in worker
    assert "handleBridgeConsole" not in worker
    assert "doom_get_selected_ammo" in worker
    assert "doom_spawn_bots" in worker
    assert 'new Worker("./engine/custom/doom.worker.js"' in app


def test_builder_keeps_jspi_and_requires_the_compatible_tomb_source():
    build = (ROOT / "engine/build/build.sh").read_text()
    assert "TOMB_GZDOOM_SOURCE_DIR" in build
    assert "emcmake cmake" in build
    assert "-sJSPI=1" in build
    assert "Asyncify" not in build
