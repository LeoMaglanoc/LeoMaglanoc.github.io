---
title: AI Coding Agent Case Study
date: 2025-12-28
categories: [blogpost]
tags: [game, canvas, javascript]
---

I've been experimenting with Codex, OpenAI's coding agent (GPT-5.2-Codex with high reasoning effort). Below are two use cases I experimented with:

- Gaming WebApps
- Mathematical proof formalizers

I 'vibecoded' in less than an hour without writing a single code line and having any previous experience in both areas. I additionally used ChatGPT for brainstorming. I'm amazed by the progress and capabilities of generative, agentic AI, even though they have some limitations too.

- [Flappy Bird]({{ '/assets/interactive/flappy/index.html' | relative_url }})
- [Top Down Racing Game]({{ '/assets/interactive/race/index.html' | relative_url }})
- [Jump and Run Sidescroller]({{ '/assets/interactive/robot-runner/index.html' | relative_url }})


everything below here is written by GenAI!

### A tiny (but useful) discrete-time barrier lemma — formalized in Lean

Barrier functions show up everywhere in safe AI and robotics: you define a scalar **safety measure**
$$
B(x) \le 0
$$
and you want to guarantee the system **stays safe over time**.

In discrete time, we can phrase this in the simplest possible way:

- Let $x_k$ be a trajectory (states at time steps $k \in \mathbb{N}$).
- Let $B : \alpha \to \mathbb{R}$ be a barrier / safety score.
- Define the scalar sequence
  $$
  b_k := B(x_k).
  $$
- Assume the barrier score never increases:
  $$
  b_{k+1} \le b_k \quad \forall k.
  $$
- And assume we start safe:
  $$
  b_0 \le 0.
  $$

**Claim (forward invariance in discrete time):**
$$
\forall k,\quad b_k \le 0
\quad\text{(equivalently, } \forall k,\ B(x_k)\le 0\text{).}
$$

---

#### Proof idea (one paragraph)

From $b_{k+1} \le b_k$, the sequence is **non-increasing**. By repeatedly chaining inequalities,
$$
b_k \le b_{k-1} \le \cdots \le b_0.
$$
So $b_k \le b_0$ for all $k$. Combining with $b_0 \le 0$ gives
$$
b_k \le 0 \quad \forall k.
$$
That’s it: **non-increasing barrier value + safe start ⇒ always safe**.

---

#### Lean formalization

Below is a Lean 4 proof (mathlib) that compiles and checks the argument mechanically.

```lean
import Mathlib.Data.Real.Basic

theorem barrier_discrete_scalar
  (b : ℕ → ℝ)
  (h_step : ∀ k : ℕ,
    b (k + 1) ≤ b k)
  (h0 : b 0 ≤ 0) :
  ∀ k : ℕ, b k ≤ 0 := by
  intro k

  have hk0 : b k ≤ b 0 := by
    induction k with
    | zero =>
        exact le_rfl
    | succ k ih =>
        exact le_trans (h_step k) ih

  exact le_trans hk0 h0

theorem barrier_discrete
  (B : α → ℝ)
  (x : ℕ → α)
  (h_step : ∀ k : ℕ,
    B (x (k + 1)) ≤ B (x k))
  (h0 : B (x 0) ≤ 0) :
  ∀ k : ℕ, B (x k) ≤ 0 := by
  intro k

  simpa using
    (barrier_discrete_scalar
      (b := fun k => B (x k))
      h_step
      h0
      k)
```
