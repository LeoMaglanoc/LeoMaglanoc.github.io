import numpy as np
import pytest
import torch
from training.config import Config
from training.env import EnvAdapter
from training.replay import Replay
from training.world_model import WorldModel
from training.actor_critic import Actor, imagine, lambda_returns
from training.dreamer import Dreamer


torch.set_num_threads(1)


def test_environment_contract_and_clipping():
    a, b = EnvAdapter(42), EnvAdapter(42)
    np.testing.assert_array_equal(a.reset(), b.reset())
    oa, _, cont, _ = a.step([20])
    ob, _, _, _ = b.step([1])
    np.testing.assert_array_equal(oa, ob)
    p = a.env.physics
    np.testing.assert_allclose(
        oa,
        [p.data.qpos[0], np.cos(p.data.qpos[1]), np.sin(p.data.qpos[1]), *p.data.qvel],
        atol=1e-6,
    )
    assert cont == 1
    done = False
    for _ in range(199):
        _, _, cont, done = a.step([0])
    assert done and cont == 1


def populated_replay():
    r = Replay(seed=10)
    for episode in range(3):
        r.begin(np.full(5, episode, np.float32))
        for t in range(40):
            r.add([0.1], 0.2, 1, np.full(5, episode, np.float32), t == 39)
    return r


def test_replay_boundaries_and_dtype():
    batch = populated_replay().sample(16, 32)
    assert batch["obs"].shape == (16, 33, 5)
    assert batch["action"].shape == (16, 32, 1)
    assert all(v.dtype == torch.float32 for v in batch.values())
    assert torch.all(batch["obs"] == batch["obs"][:, :1])
    with pytest.raises(ValueError):
        Replay().sample(1, 2)


def test_rssm_contract_gradients():
    c = Config()
    world = WorldModel(c)
    state = world.rssm.initial(4)
    assert state["h"].shape == (4, 64)
    assert state["z"].shape == (4, 8, 8)
    assert not state["h"].any() and not state["z"].any()
    state, prior = world.observe_step(state, torch.zeros(4, 1), torch.randn(4, 5))
    assert torch.allclose(state["z"].sum(-1), torch.ones(4, 8))
    assert world.rssm.feature(state).shape == (4, 128)
    future = world.rssm.imagine_step(state, torch.ones(4, 1))
    world.decode(future).square().mean().backward()
    assert all(
        torch.isfinite(p.grad).all() for p in world.parameters() if p.grad is not None
    )
    assert all(torch.isfinite(v).all() for v in prior.values())


def test_imagination_and_lambda_returns():
    c = Config()
    world, actor = WorldModel(c), Actor(c)
    f, a, r, d = imagine(world, actor, world.rssm.initial(3), 15)
    assert f.shape == (16, 3, c.feature_dim)
    assert a.shape == (15, 3, 1)
    assert a.abs().max() <= 1
    assert all(torch.isfinite(v).all() for v in (f, a, r, d))
    result = lambda_returns(
        torch.ones(3, 1, 1), torch.zeros(4, 1, 1), torch.ones(3, 1, 1), 1
    )
    torch.testing.assert_close(result.flatten(), torch.tensor([3.0, 2.0, 1.0]))


def test_update_changes_actor_through_frozen_model(tmp_path):
    agent = Dreamer(Config())
    before = [p.detach().clone() for p in agent.actor.parameters()]
    metrics = agent.update(populated_replay().sample(4, 12))
    assert all(np.isfinite(v) for v in metrics.values())
    assert any(not torch.equal(a, b) for a, b in zip(before, agent.actor.parameters()))
    agent.save(tmp_path / "test.pt")
    restored = Dreamer.load(tmp_path / "test.pt")
    assert restored.updates == 1
    for a, b in zip(agent.world.parameters(), restored.world.parameters()):
        torch.testing.assert_close(a, b)


def test_refined_multistep_model_update():
    c = Config(overshoot=5, deterministic_imagination=True, exploration=0.1)
    agent = Dreamer(c)
    metrics = agent.update(populated_replay().sample(4, 16))
    assert metrics["overshooting"] > 0
    assert all(np.isfinite(v) for v in metrics.values())
