//! Small shared MLP: flattened [2,6,6] -> 64 ReLU -> policy 108, value tanh.
//! A deliberate CPU-friendly capacity reduction from the proposed residual CNN.
use crate::{game::Position, mcts::Evaluator};
use burn::{
    backend::Flex,
    nn::{Linear, LinearConfig},
    prelude::*,
};
use serde::{Deserialize, Serialize};
pub type Cpu = Flex;
#[derive(Module, Debug)]
pub struct Network<B: Backend> {
    pub hidden: Linear<B>,
    pub policy: Linear<B>,
    pub value: Linear<B>,
}
impl<B: Backend> Network<B> {
    pub fn new(device: &B::Device) -> Self {
        Self {
            hidden: LinearConfig::new(72, 64).init(device),
            policy: LinearConfig::new(64, 108).init(device),
            value: LinearConfig::new(64, 1).init(device),
        }
    }
    pub fn forward(&self, x: Tensor<B, 2>) -> (Tensor<B, 2>, Tensor<B, 2>) {
        let h = burn::tensor::activation::relu(self.hidden.forward(x));
        (self.policy.forward(h.clone()), self.value.forward(h).tanh())
    }
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Weights {
    pub hidden_w: Vec<f32>,
    pub hidden_b: Vec<f32>,
    pub policy_w: Vec<f32>,
    pub policy_b: Vec<f32>,
    pub value_w: Vec<f32>,
    pub value_b: Vec<f32>,
    pub generation: usize,
    pub steps: usize,
    pub seed: u64,
    pub architecture: String,
}
fn vec_data<B: Backend, const D: usize>(t: Tensor<B, D>) -> Vec<f32> {
    t.into_data().to_vec::<f32>().unwrap()
}
impl Network<Cpu> {
    pub fn weights(&self, generation: usize, steps: usize, seed: u64) -> Weights {
        Weights {
            hidden_w: vec_data(self.hidden.weight.val()),
            hidden_b: vec_data(self.hidden.bias.as_ref().unwrap().val()),
            policy_w: vec_data(self.policy.weight.val()),
            policy_b: vec_data(self.policy.bias.as_ref().unwrap().val()),
            value_w: vec_data(self.value.weight.val()),
            value_b: vec_data(self.value.bias.as_ref().unwrap().val()),
            generation,
            steps,
            seed,
            architecture: "72 → 64 ReLU → (108 logits, 1 tanh); Burn Flex f32".into(),
        }
    }
    pub fn from_weights(w: &Weights) -> Result<Self, String> {
        if w.hidden_w.len() != 72 * 64
            || w.hidden_b.len() != 64
            || w.policy_w.len() != 64 * 108
            || w.policy_b.len() != 108
            || w.value_w.len() != 64
            || w.value_b.len() != 1
            || w.hidden_w
                .iter()
                .chain(&w.hidden_b)
                .chain(&w.policy_w)
                .chain(&w.policy_b)
                .chain(&w.value_w)
                .chain(&w.value_b)
                .any(|x| !x.is_finite())
        {
            return Err("Invalid checkpoint dimensions or weights".into());
        }
        let d = Default::default();
        let mut n = Self::new(&d);
        n.hidden.weight = burn::module::Param::from_tensor(Tensor::from_data(
            TensorData::new(w.hidden_w.clone(), [72, 64]),
            &d,
        ));
        n.hidden.bias = Some(burn::module::Param::from_tensor(Tensor::from_data(
            TensorData::new(w.hidden_b.clone(), [64]),
            &d,
        )));
        n.policy.weight = burn::module::Param::from_tensor(Tensor::from_data(
            TensorData::new(w.policy_w.clone(), [64, 108]),
            &d,
        ));
        n.policy.bias = Some(burn::module::Param::from_tensor(Tensor::from_data(
            TensorData::new(w.policy_b.clone(), [108]),
            &d,
        )));
        n.value.weight = burn::module::Param::from_tensor(Tensor::from_data(
            TensorData::new(w.value_w.clone(), [64, 1]),
            &d,
        ));
        n.value.bias = Some(burn::module::Param::from_tensor(Tensor::from_data(
            TensorData::new(w.value_b.clone(), [1]),
            &d,
        )));
        Ok(n)
    }
}
impl Evaluator for Network<Cpu> {
    fn evaluate(&self, p: &Position) -> ([f32; 108], f32) {
        let d = Default::default();
        let (policy, value) = self.forward(Tensor::from_data(
            TensorData::new(p.encode().to_vec(), [1, 72]),
            &d,
        ));
        (vec_data(policy).try_into().unwrap(), vec_data(value)[0])
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shape_and_checkpoint() {
        Cpu::seed(&Default::default(), 7);
        let n = Network::<Cpu>::new(&Default::default());
        let (p, v) = n.forward(Tensor::zeros([3, 72], &Default::default()));
        assert_eq!(p.dims(), [3, 108]);
        assert_eq!(v.dims(), [3, 1]);
        for x in vec_data(v) {
            assert!((-1. ..=1.).contains(&x));
        }
        let original = n.evaluate(&Position::default());
        let restored = Network::from_weights(&n.weights(0, 0, 7))
            .unwrap()
            .evaluate(&Position::default());
        assert_eq!(original, restored);
    }
}
