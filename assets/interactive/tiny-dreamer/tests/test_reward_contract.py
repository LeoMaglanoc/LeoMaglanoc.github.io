import numpy as np
from training.env import EnvAdapter


def test_browser_reward_formula_against_native():
    env = EnvAdapter(32)
    env.reset()

    def gaussian(x, margin):
        return np.exp(np.log(0.1) * (x / margin) ** 2)

    for theta, velocity, position, action in [
        (0.1, 0.3, 0.5, 0.2),
        (2.0, -6.0, -1.5, 0.9),
        (0.0, 0.0, 0.0, 0.0),
    ]:
        with env.env.physics.reset_context():
            env.env.physics.data.qpos[:] = [position, theta]
            env.env.physics.data.qvel[:] = [0, velocity]
            env.env.physics.data.ctrl[:] = [action]
        native = env.env.task.get_reward(env.env.physics)
        equivalent = (
            (np.cos(theta) + 1)
            / 2
            * (1 + gaussian(position, 2))
            / 2
            * (4 + max(0, 1 - action**2))
            / 5
            * (1 + gaussian(velocity, 5))
            / 2
        )
        np.testing.assert_allclose(equivalent, native, atol=1e-12)
