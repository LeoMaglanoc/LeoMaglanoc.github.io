---
layout: page
title: TUM Research Assistant on Safe Robotics
permalink: /projects/robotics-research-assistant/
date: 2024-04-20 14:00:00
category: work
youtubeId1: IUAeZGau28E
youtubeId2: h6Sn1aZDQe4
---

{% include youtubePlayer.html id= page.youtubeId1%}

We cannot directly deploy embodied AI agents in human environments, as they may exhibit unforeseen and erratic behavior under OOD conditions. We solve this problem with our SARA shield that provides formal safety verification for autonomous robots in human environments.

Our safety shield (developed at [TUM CPS](https://www.ce.cit.tum.de/cps/home/)) uses set-based reachability analysis to verify if a contact between the human and the robot is possible before we could stop the robot. SARA shield comes in two modes: in the speed and separation monitoring (SSM), it guarantees that the robot is stopped before a collision could occur, and in the power and force limiting (PFL) mode, we guarantee pain-free contacts by limiting the kinetic energy of the robot before contact. Our safety shield is the first of its kind, providing provable safety for continuous action spaces in high-dimensional state-spaces and unpredictable dynamic environments. It can be applied to a variety of manipulation tasks and is highly effective in quickly reacting to highly dynamic human motion.

Publications:
- IEEE T-RO 2025: A General Safety Framework for Autonomous Manipulation in Human Environments [[Arxiv]](https://arxiv.org/abs/2412.10180)

{% include youtubePlayer.html id= page.youtubeId2%}

