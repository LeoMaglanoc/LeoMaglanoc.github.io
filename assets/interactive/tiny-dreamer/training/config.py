from dataclasses import dataclass, asdict


@dataclass
class Config:
    seed: int = 7
    obs_dim: int = 5
    action_dim: int = 1
    hidden: int = 64
    stoch: int = 8
    classes: int = 8
    embed: int = 64
    width: int = 128
    batch: int = 16
    sequence: int = 32
    horizon: int = 15
    imagination_batch: int = 64
    action_repeat: int = 5
    discount: float = 0.99
    lambda_: float = 0.95
    model_lr: float = 0.0003
    actor_lr: float = 0.0001
    critic_lr: float = 0.0003
    kl_scale: float = 0.1
    free_nats: float = 1.0
    exploration: float = 0.3
    overshoot: int = 0
    deterministic_imagination: bool = False

    @property
    def feature_dim(self):
        return self.hidden + self.stoch * self.classes

    def dict(self):
        return asdict(self)
