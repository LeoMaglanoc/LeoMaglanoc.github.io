---
title: My Mission
date: 2025-12-17
permalink: /mission
categories: [blogpost]
tags: [research]
---

I work on making humanoid autonomy deployable through formal safety guarantees.

Humanoid robots are becoming capable, but not yet safe enough to deploy at scale in human environments.

My incoming PhD builds the missing layer: a policy-agnostic runtime safety shield that enforces provable guarantees from intent to torque.

Long-term, I’m building a physical AI safety startup in Europe, developing certifiable safety infrastructure for real-world deployment.

## Near-Term Research

Recent progress in foundation models suggests that general humanoid autonomy may be within reach. Yet real-world deployment still relies on human supervision, similar to safety teleoperation in autonomous driving.

As OpenAI co-founder and former Chief Scientist Ilya Sutskever [remarked](https://www.youtube.com/watch?v=aR20FWCCjAs), we are shifting from the “age of scaling” back into an “age of research”. Scaling improves capability; it does not provide guarantees. What is required are algorithmic advances that introduce structure and formal guarantees.

A central challenge is ensuring that learning-based control systems (VLA-based or RL-based) operate within certifiable safety envelopes. My work on a safety shield for human–robot interaction ([T-RO paper](https://scholar.google.com/citations?view_op=view_citation&hl=en&user=bSMJcYMAAAAJ&citation_for_view=bSMJcYMAAAAJ:u5HHmVD_uO8C), [demo](https://youtu.be/IUAeZGau28E?si=0zWlQfw3i6It8nDD)) demonstrates how runtime verification and failsafe planning can constrain robot behavior in human environments while preserving performance.

The next step is extending this framework to full humanoid systems. This requires:

- Unifying manipulation and locomotion within a single safe loco-manipulation framework  
- Integrating semantic safety reasoning with foundation models  
- Validating safe humanoid systems in real-world industrial and domestic environments  

The objective is to make humanoid autonomy deployable at scale through formal safety guarantees.

## Long-Term Vision

Already today, LLMs lower barriers to building [dangerous systems](https://red.anthropic.com/2025/biorisk/) and agentic AI can automate access to harmful resources. As AI capabilities continue to improve, safety risks are increasingly extending from digital systems into the physical world. 

While substantial effort has been devoted to digital AI safety, physical AI safety (e.g., for autonomous robots operating in human environments) remains comparatively underdeveloped.

My long-term vision is to establish certifiable safety standards for physical AI in Europe and translate them into deployable infrastructure for real-world systems (e.g., humanoid robots, autonomous drones, and human-in-the-loop embodied systems such as brain-computer interfaces). For agentic systems, physical safety cannot be separated from semantic safety: robots must not only act within physical constraints, but also [align their behavior with human-defined norms and values](https://www.anthropic.com/news/claude-new-constitution).

Achieving this requires tight collaboration among academia, industry, and regulators to ensure that embodied AI systems are not only capable, but certifiably safe by design.