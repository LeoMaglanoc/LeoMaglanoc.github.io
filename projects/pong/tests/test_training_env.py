from gymnasium.utils.env_checker import check_env

from rl import constants as C
from rl.training_env import SoloPongEnv


def test_solo_training_environment_checker():
    check_env(SoloPongEnv())


def test_left_wall_reflects_and_hit_is_positive():
    env = SoloPongEnv()
    env.reset(seed=1)
    env.state.update(ball_x=C.BALL_RADIUS + 0.001, ball_y=0.5, ball_vx=-0.5, ball_vy=0.0)
    _, reward, terminated, truncated, info = env.step(C.ACTION_STAY)
    assert env.state["ball_vx"] > 0
    assert reward == 0
    assert not terminated
    assert not truncated
    assert not info["paddle_hit"]

    env.state.update(
        ball_x=C.WIDTH - C.PADDLE_MARGIN - C.PADDLE_WIDTH - C.BALL_RADIUS - 0.001,
        ball_y=0.5,
        ball_vx=0.5,
        ball_vy=0.0,
    )
    _, reward, terminated, _, info = env.step(C.ACTION_STAY)
    assert reward == C.HIT_REWARD
    assert info["paddle_hit"]
    assert not terminated


def test_solo_miss_is_negative_and_terminates():
    env = SoloPongEnv()
    env.reset(seed=1)
    env.state.update(ball_x=C.WIDTH, ball_y=0.1, ball_vx=1.0, ball_vy=0.0)
    obs, reward, terminated, _, info = env.step(C.ACTION_STAY)
    assert reward == C.MISS_REWARD
    assert terminated
    assert info["point_scored"] == "miss"
    assert env.observation_space.contains(obs)
