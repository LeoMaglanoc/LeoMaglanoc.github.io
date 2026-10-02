import copy
from pathlib import Path
import torch
from torch.nn import functional as F
from .world_model import WorldModel
from .actor_critic import Actor, Critic, imagine, lambda_returns


class Dreamer:
    def __init__(self, c):
        self.c = c
        self.world = WorldModel(c)
        self.actor = Actor(c)
        self.critic = Critic(c)
        self.target = copy.deepcopy(self.critic).requires_grad_(False)
        self.model_opt = torch.optim.Adam(self.world.parameters(), lr=c.model_lr)
        self.actor_opt = torch.optim.Adam(self.actor.parameters(), lr=c.actor_lr)
        self.critic_opt = torch.optim.Adam(self.critic.parameters(), lr=c.critic_lr)
        self.updates = 0

    @staticmethod
    def optimize(loss, optimizer, parameters):
        if not torch.isfinite(loss):
            raise FloatingPointError("Non-finite training loss")
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(parameters, 100, error_if_nonfinite=True)
        optimizer.step()

    def update(self, batch, behavior=True):
        c = self.c
        loss, states, metrics = self.world.loss(batch)
        self.optimize(loss, self.model_opt, self.world.parameters())
        if behavior:
            # Discard chunk warm-up states. Detach the starts, but retain gradients
            # through frozen world-model dynamics to train the actor.
            flattened = {
                k: v[:, 5:].detach().reshape(-1, *v.shape[2:])
                for k, v in states.items()
            }
            indices = torch.randint(len(flattened["h"]), (c.imagination_batch,))
            start = {k: v[indices] for k, v in flattened.items()}
            self.world.requires_grad_(False)
            self.target.requires_grad_(False)
            features, actions, rewards, cont = imagine(
                self.world,
                self.actor,
                start,
                c.horizon,
                latent_sample=not c.deterministic_imagination,
            )
            values = self.target(features)
            discounts = c.discount * cont
            returns = lambda_returns(rewards, values, discounts, c.lambda_)
            weights = torch.cumprod(
                torch.cat([torch.ones_like(discounts[:1]), discounts[:-1]], 0), 0
            ).detach()
            actor_loss = -(weights * returns).mean()
            self.optimize(actor_loss, self.actor_opt, self.actor.parameters())
            critic_loss = (
                weights
                * F.mse_loss(
                    self.critic(features[:-1].detach()),
                    returns.detach(),
                    reduction="none",
                )
            ).mean()
            self.optimize(critic_loss, self.critic_opt, self.critic.parameters())
            with torch.no_grad():
                for target, source in zip(
                    self.target.parameters(), self.critic.parameters()
                ):
                    target.lerp_(source, 0.02)
            self.world.requires_grad_(True)
            metrics.update(
                actor=float(actor_loss.detach()),
                critic=float(critic_loss.detach()),
                imagined_reward=float(rewards.detach().mean()),
            )
        self.updates += 1
        return metrics

    def save(self, path):
        path = Path(path)
        temporary = path.with_suffix(path.suffix + ".tmp")
        torch.save(
            {
                "config": self.c.dict(),
                "updates": self.updates,
                **{
                    k: getattr(self, k).state_dict()
                    for k in (
                        "world",
                        "actor",
                        "critic",
                        "target",
                        "model_opt",
                        "actor_opt",
                        "critic_opt",
                    )
                },
            },
            temporary,
        )
        temporary.replace(path)

    @classmethod
    def load(cls, path):
        from .config import Config

        checkpoint = torch.load(path, map_location="cpu", weights_only=False)
        agent = cls(Config(**checkpoint["config"]))
        for k in (
            "world",
            "actor",
            "critic",
            "target",
            "model_opt",
            "actor_opt",
            "critic_opt",
        ):
            getattr(agent, k).load_state_dict(checkpoint[k])
        agent.updates = checkpoint["updates"]
        return agent
