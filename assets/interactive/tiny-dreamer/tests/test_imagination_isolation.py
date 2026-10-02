import torch
from training.config import Config
from training.world_model import WorldModel
from training.actor_critic import Actor, imagine


def test_imagination_uses_no_real_environment(monkeypatch):
    import dm_control.suite

    monkeypatch.setattr(
        dm_control.suite,
        "load",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("Environment accessed during imagination")
        ),
    )
    c = Config()
    world, actor = WorldModel(c), Actor(c)
    features, actions, rewards, _ = imagine(world, actor, world.rssm.initial(2), 15)
    (rewards.mean() + features.mean()).backward()
    assert actions.shape[0] == 15
    assert any(
        p.grad is not None and p.grad.abs().sum() > 0 for p in actor.parameters()
    )
