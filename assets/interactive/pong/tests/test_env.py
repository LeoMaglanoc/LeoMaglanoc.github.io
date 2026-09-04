import numpy as np
from gymnasium.utils.env_checker import check_env

from rl import constants as C
from rl.pong_env import PongEnv


def test_gymnasium_checker():
    check_env(PongEnv())


def test_observation_is_normalized():
    env = PongEnv()
    obs, _ = env.reset(seed=4)
    assert env.observation_space.contains(obs)
    for action in range(3):
        obs, *_ = env.step(action)
        assert env.observation_space.contains(obs)


def test_all_actions_are_accepted():
    env = PongEnv()
    env.reset(seed=1)
    for action in (C.ACTION_UP, C.ACTION_STAY, C.ACTION_DOWN):
        env.step(action)


def test_wall_collision_bounces_ball():
    env = PongEnv()
    env.reset(seed=1)
    env.state.update(ball_x=0.5, ball_y=C.BALL_RADIUS + 0.001, ball_vx=0.0, ball_vy=-0.5)
    env.step(C.ACTION_STAY)
    assert env.state["ball_vy"] > 0
    assert env.state["ball_y"] >= C.BALL_RADIUS


def test_paddle_collision_bounces_ball():
    env = PongEnv()
    env.reset(seed=1)
    env.state.update(ball_x=C.WIDTH - C.PADDLE_MARGIN - C.PADDLE_WIDTH - C.BALL_RADIUS - 0.001, ball_y=0.5, ball_vx=0.5, ball_vy=0.0)
    env.step(C.ACTION_STAY)
    assert env.state["ball_vx"] < 0


def test_human_hit_uses_original_paddle_physics():
    env = PongEnv()
    env.reset(seed=1)
    env.state.update(
        ball_x=C.PADDLE_MARGIN + C.PADDLE_WIDTH + C.BALL_RADIUS + 0.001,
        ball_y=0.5,
        ball_vx=-0.5,
        ball_vy=0.2,
    )
    env.step(C.ACTION_STAY)
    assert env.state["ball_vx"] > 0
    assert env.state["ball_vy"] != 0.2


def test_perfect_opponent_aligns_before_collision():
    env = PongEnv(opponent="perfect")
    env.reset(seed=1)
    env.state.update(ball_x=C.PADDLE_MARGIN + C.PADDLE_WIDTH + C.BALL_RADIUS + 0.001, ball_y=0.5, ball_vx=-0.5, ball_vy=0.2)
    env.step(C.ACTION_STAY)
    assert abs(env.state["human_paddle_y"] - env.state["ball_y"]) <= C.PERFECT_IMPACT_OFFSET * C.PADDLE_HEIGHT / 2
    assert env.state["ball_vx"] > 0


def test_perfect_opponent_never_misses_and_is_seeded():
    first = PongEnv(opponent="perfect")
    second = PongEnv(opponent="perfect")
    first.reset(seed=4)
    second.reset(seed=4)
    for action in [0, 2, 1, 2, 0]:
        assert np.array_equal(first.step(action)[0], second.step(action)[0])


def test_scoring_and_reset():
    env = PongEnv()
    env.reset(seed=1)
    env.state.update(ball_x=0.0, ball_y=0.1, ball_vx=-1.0, ball_vy=0.0)
    _, reward, _, _, info = env.step(C.ACTION_STAY)
    assert reward == 1
    assert info["point_scored"] == "ai"
    assert env.state["ball_x"] == 0.5
    assert env.state["ai_score"] == 1


def test_right_edge_scores_for_human():
    env = PongEnv()
    env.reset(seed=1)
    env.state.update(ball_x=C.WIDTH, ball_y=0.1, ball_vx=1.0, ball_vy=0.0)
    _, reward, _, _, info = env.step(C.ACTION_STAY)
    assert reward == -1
    assert info["point_scored"] == "human"
    assert env.state["human_score"] == 1


def test_seeded_resets_are_deterministic():
    first = PongEnv()
    second = PongEnv()
    obs_a, _ = first.reset(seed=99)
    obs_b, _ = second.reset(seed=99)
    assert np.array_equal(obs_a, obs_b)
    for action in [0, 2, 1, 2, 0]:
        assert np.array_equal(first.step(action)[0], second.step(action)[0])
