"""Faithful, container-only access to Arnold's pinned Track-1 module."""

from __future__ import annotations

import os
import sys
from argparse import Namespace
from pathlib import Path

import torch


ARNOLD_DIR = Path(os.environ.get("ARNOLD_DIR", "/opt/arnold"))
if not ARNOLD_DIR.is_dir():
    raise RuntimeError("Arnold is available only in the doom-tools Docker image.")
sys.path.insert(0, str(ARNOLD_DIR))

from src.doom.actions import ActionBuilder  # noqa: E402
from src.doom.game import Game  # noqa: E402
from src.model.dqn.recurrent import DQNModuleRecurrent  # noqa: E402


TRACK1_ACTION_COMBINATIONS = "attack+move_lr;turn_lr;move_fb"
TRACK1_GAME_VARIABLES = [("health", 101), ("sel_ammo", 301)]


def build_params() -> Namespace:
    """Return the exact model-related settings supplied by upstream run.sh."""
    params = Namespace(
        action_combinations=TRACK1_ACTION_COMBINATIONS,
        use_continuous=False,
        speed="on",
        crouch="off",
        freelook=False,
        game_variables=TRACK1_GAME_VARIABLES,
        n_variables=2,
        game_features="target,enemy",
        n_features=2,
        n_fm=3,
        height=60,
        width=108,
        gray=False,
        dump_freq=0,
        hidden_dim=512,
        dropout=0.5,
        use_bn=False,
        bucket_size=[10, 1],
        variable_dim=[32, 32],
        dueling_network=False,
        recurrence="lstm",
        n_rec_layers=1,
        hist_size=4,
        remember=True,
        gpu_id=-1,
    )
    action_builder = ActionBuilder(params)
    if params.n_actions != 35:
        raise AssertionError(f"Expected 35 Track-1 actions, got {params.n_actions}")
    return params


def load_module() -> tuple[DQNModuleRecurrent, Namespace]:
    params = build_params()
    module = DQNModuleRecurrent(params).eval()
    checkpoint = ARNOLD_DIR / "pretrained/vizdoom_2017_track1.pth"
    state = torch.load(checkpoint, map_location="cpu", weights_only=True)
    module.load_state_dict(state, strict=True)
    return module, params


def initial_state() -> tuple[torch.Tensor, torch.Tensor]:
    state = torch.zeros((1, 1, 512), dtype=torch.float32)
    return state, state.clone()


def create_track1_game(params: Namespace, *, visible: bool = False) -> Game:
    """Create the upstream Track-1 scenario with exactly ten scripted bots."""
    action_builder = ActionBuilder(params)
    game = Game(
        scenario="deathmatch_rockets",
        action_builder=action_builder,
        score_variable="USER2",
        freedoom=True,
        use_screen_buffer=True,
        use_depth_buffer=False,
        labels_mapping="",
        game_features="target,enemy",
        mode="PLAYER",
        player_rank=0,
        players_per_game=1,
        render_hud=False,
        render_crosshair=True,
        render_weapon=True,
        freelook=False,
        visible=visible,
        n_bots=10,
        use_scripted_marines=True,
    )
    game.start(map_id=1, log_events=True, manual_control=True)
    game.randomize_textures(False)
    game.init_bots_health(100)
    return game
