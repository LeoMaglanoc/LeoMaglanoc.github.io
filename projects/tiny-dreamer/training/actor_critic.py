import torch
from torch import nn
from .world_model import mlp


class Actor(nn.Module):
    def __init__(self, c):
        super().__init__()
        self.net = mlp(c.feature_dim, 2 * c.action_dim, c.width)
        # Avoid a saturated action distribution at initialization.
        nn.init.zeros_(self.net[-1].weight)
        nn.init.zeros_(self.net[-1].bias)

    def forward(self, feature, sample=True):
        mean, raw = self.net(feature).chunk(2, -1)
        scale = 0.1 + 0.9 * torch.sigmoid(raw)
        action = (
            (mean + scale * torch.randn_like(mean)).tanh() if sample else mean.tanh()
        )
        return action


class Critic(nn.Module):
    def __init__(self, c):
        super().__init__()
        self.net = mlp(c.feature_dim, 1, c.width)

    def forward(self, feature):
        return self.net(feature)


def lambda_returns(rewards, values, discounts, lambda_):
    """Rewards/discounts are for successor states; values includes bootstrap."""
    next_return = values[-1]
    returns = []
    for t in reversed(range(len(rewards))):
        next_return = rewards[t] + discounts[t] * (
            (1 - lambda_) * values[t + 1] + lambda_ * next_return
        )
        returns.append(next_return)
    return torch.stack(list(reversed(returns)))


def imagine(world, actor, start, horizon, sample=True, latent_sample=None):
    """Pure neural rollout. This function has no environment dependency."""
    state = start
    features = [world.rssm.feature(state)]
    actions, rewards, continuations = [], [], []
    for _ in range(horizon):
        action = actor(features[-1], sample)
        state = world.rssm.imagine_step(
            state, action, sample if latent_sample is None else latent_sample
        )
        feature = world.rssm.feature(state)
        actions.append(action)
        features.append(feature)
        rewards.append(world.reward(feature))
        continuations.append(world.continuation(feature).sigmoid())
    return (
        torch.stack(features),
        torch.stack(actions),
        torch.stack(rewards),
        torch.stack(continuations),
    )
