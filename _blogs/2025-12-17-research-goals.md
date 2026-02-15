---
title: My Mission
date: 2025-12-17
permalink: /blog/research-goals/
categories: [blogpost]
tags: [research]
---

Recent progress with foundation models suggests that general humanoid autonomy may be within reach. Yet real-world deployment still relies on human supervision, similar to safety teleoperation in autonomous driving.

[As Ilya Sutskever remarked](https://www.youtube.com/watch?v=aR20FWCCjAs), we are shifting from the "age of scaling" back into an "age of research". Scaling improves capability; it does not provide guarantees. What is required is a set of algorithmic breakthroughs that introduce structure and formal guarantees.

One central challenge is ensuring that learning-based control systems (VLA-based or RL-based) operate within certifiable safety envelopes. My work on our [safety shield](https://scholar.google.com/citations?view_op=view_citation&hl=en&user=bSMJcYMAAAAJ&citation_for_view=bSMJcYMAAAAJ:u5HHmVD_uO8C) for human-robot interaction demonstrates how formal safety verification and runtime failsafe planning can constrain robot behavior in human environments while preserving performance.

The next step is to extend this approach to humanoid systems. This involves three tightly coupled challenges:
- Unifying manipulation and locomotion within a single safe loco-manipulation framework
- Integrating semantic (safety) reasoning with foundation models
- Deploying and validating safe humanoid systems in real-world industrial and domestic environments

The objective is to make humanoid autonomy deployable at scale through formal safety guarantees.

## Long-Term Vision

Robotics & AI can be both a force for [good](https://www.darioamodei.com/essay/machines-of-loving-grace) and for [harm](https://www.darioamodei.com/essay/the-adolescence-of-technology). Already today, LLMs lower barriers to building [dangerous systems](https://red.anthropic.com/2025/biorisk/) and agentic AI can automate access to harmful resources. As AI capabilities continue to improve, these risks will increasingly extend into the physical world. 

While substantial effort has been devoted to digital AI safety, physical AI safety (e.g., for autonomous robots operating in human environments) remains comparatively underdeveloped.

My long-term vision is to found a research-first physical AI safety startup in Europe dedicated to establishing certifiable safety standards for physical AI and translating them into deployable systems for real-world use (e.g., humanoid robots, autonomous drones, and human-in-the-loop embodied systems such as brain-computer interfaces). For agentic systems, physical safety cannot be separated from semantic safety: robots must not only act within physical constraints, but also [align their behavior with human-defined norms and values](https://www.anthropic.com/news/claude-new-constitution).

Achieving this will require collaboration among academia, industry, and regulators to enable the creation of safe, value-aligned embodied AI that can be deployed responsibly in the real world with meaningful guarantees.

