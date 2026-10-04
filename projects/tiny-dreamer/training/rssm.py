import torch
from torch import nn
from torch.nn import functional as F


def categorical(logits, sample=True):
    probs = logits.softmax(-1)
    # Uniform mixture guards against collapsing categorical probabilities.
    probs = 0.99 * probs + 0.01 / probs.shape[-1]
    if sample:
        index = torch.distributions.Categorical(probs=probs).sample()
        hard = F.one_hot(index, probs.shape[-1]).float()
        return hard + probs - probs.detach()
    # Probability inference is deterministic and exports cleanly to ONNX.
    return probs


class RSSM(nn.Module):
    """Single recurrent transition with explicit h/z state.

    observe_step accepts an *encoded* observation. WorldModel.observe_step is
    the raw-observation interface and applies the saved physical scales first.
    A previous action moves the belief forward before assimilating the current
    observation; imagine_step performs the same transition without that evidence.
    """

    def __init__(self, c):
        super().__init__()
        self.c = c
        self.input = nn.Sequential(
            nn.Linear(c.stoch * c.classes + c.action_dim, c.hidden), nn.ELU()
        )
        self.gru = nn.GRUCell(c.hidden, c.hidden)
        self.prior = nn.Sequential(
            nn.Linear(c.hidden, c.width),
            nn.ELU(),
            nn.Linear(c.width, c.stoch * c.classes),
        )
        self.posterior = nn.Sequential(
            nn.Linear(c.hidden + c.embed, c.width),
            nn.ELU(),
            nn.Linear(c.width, c.stoch * c.classes),
        )

    def initial(self, batch_size):
        p = next(self.parameters())
        return {
            "h": p.new_zeros(batch_size, self.c.hidden),
            "z": p.new_zeros(batch_size, self.c.stoch, self.c.classes),
        }

    def imagine_step(self, prev_state, action, sample=True):
        h = self.gru(
            self.input(torch.cat([prev_state["z"].flatten(-2), action], -1)),
            prev_state["h"],
        )
        logits = self.prior(h).reshape(-1, self.c.stoch, self.c.classes)
        return {"h": h, "z": categorical(logits, sample), "logits": logits}

    def observe_step(self, prev_state, prev_action, embedding, sample=True):
        prior = self.imagine_step(prev_state, prev_action, sample)
        logits = self.posterior(torch.cat([prior["h"], embedding], -1)).reshape(
            -1, self.c.stoch, self.c.classes
        )
        posterior = {
            "h": prior["h"],
            "z": categorical(logits, sample),
            "logits": logits,
        }
        return posterior, prior

    def feature(self, state):
        return torch.cat([state["h"], state["z"].flatten(-2)], -1)
