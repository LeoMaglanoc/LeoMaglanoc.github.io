import torch
from torch import nn
from torch.nn import functional as F
from .rssm import RSSM
from .env import OBS_SCALE


def mlp(input_dim, output_dim, width):
    return nn.Sequential(
        nn.Linear(input_dim, width),
        nn.ELU(),
        nn.Linear(width, width),
        nn.ELU(),
        nn.Linear(width, output_dim),
    )


class WorldModel(nn.Module):
    def __init__(self, c):
        super().__init__()
        self.c = c
        self.register_buffer("scale", torch.tensor(OBS_SCALE))
        self.encoder = mlp(c.obs_dim, c.embed, c.width)
        self.rssm = RSSM(c)
        self.decoder = mlp(c.feature_dim, c.obs_dim, c.width)
        self.reward = mlp(c.feature_dim, 1, c.width)
        self.continuation = mlp(c.feature_dim, 1, c.width)

    def observe_step(self, state, action, observation, sample=True):
        return self.rssm.observe_step(
            state, action, self.encoder(observation / self.scale), sample
        )

    def decode(self, state):
        return self.decoder(self.rssm.feature(state)) * self.scale

    def loss(self, batch):
        c = self.c
        obs = batch["obs"] / self.scale
        embeddings = self.encoder(obs)
        state = self.rssm.initial(obs.shape[0])
        zero = obs.new_zeros(obs.shape[0], c.action_dim)
        states, priors = [], []
        for t in range(obs.shape[1]):
            state, prior = self.rssm.observe_step(
                state, zero if t == 0 else batch["action"][:, t - 1], embeddings[:, t]
            )
            states.append(state)
            priors.append(prior)
        features = torch.stack([self.rssm.feature(s) for s in states], 1)
        recon = F.mse_loss(self.decoder(features), obs)
        reward = F.mse_loss(self.reward(features[:, 1:]), batch["reward"])
        cont = F.binary_cross_entropy_with_logits(
            self.continuation(features[:, 1:]), batch["continue"]
        )
        post_logits = torch.stack([s["logits"] for s in states], 1)
        prior_logits = torch.stack([s["logits"] for s in priors], 1)

        def kl(q, p):
            q = 0.99 * q.softmax(-1) + 0.01 / c.classes
            p = 0.99 * p.softmax(-1) + 0.01 / c.classes
            return (
                (q * (q.log() - p.log())).sum(-1).sum(-1).clamp_min(c.free_nats).mean()
            )

        latent = 0.8 * kl(post_logits.detach(), prior_logits) + 0.2 * kl(
            post_logits, prior_logits.detach()
        )
        # A prior decode loss gives direct short-horizon dynamics supervision.
        prior_features = torch.stack([self.rssm.feature(s) for s in priors[1:]], 1)
        prediction = F.mse_loss(self.decoder(prior_features), obs[:, 1:])
        loss = recon + reward + cont + c.kl_scale * latent + prediction
        stacked = {k: torch.stack([s[k] for s in states], 1) for k in ("h", "z")}
        overshoot = obs.new_zeros(())
        if c.overshoot:
            # Five-step open-loop supervision with real held actions. Use
            # deterministic probability latents to match browser dynamics.
            starts = list(range(0, obs.shape[1] - c.overshoot, 4))
            dream_state = {
                k: stacked[k][:, starts].reshape(-1, *stacked[k].shape[2:])
                for k in ("h", "z")
            }
            for h in range(1, c.overshoot + 1):
                indices = [t + h - 1 for t in starts]
                held_actions = batch["action"][:, indices].reshape(-1, c.action_dim)
                dream_state = self.rssm.imagine_step(dream_state, held_actions, False)
                feature = self.rssm.feature(dream_state)
                target_obs = obs[:, [t + h for t in starts]].reshape(-1, c.obs_dim)
                target_reward = batch["reward"][:, indices].reshape(-1, 1)
                overshoot = (
                    overshoot
                    + F.mse_loss(self.decoder(feature), target_obs)
                    + 0.5 * F.mse_loss(self.reward(feature), target_reward)
                )
            overshoot = overshoot / c.overshoot
            loss = loss + overshoot
        metrics = {
            k: float(v.detach())
            for k, v in {
                "loss": loss,
                "reconstruction": recon,
                "reward": reward,
                "continuation": cont,
                "kl": latent,
                "prediction": prediction,
                "overshooting": overshoot,
            }.items()
        }
        return loss, stacked, metrics
