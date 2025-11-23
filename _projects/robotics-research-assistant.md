---
layout: page
title: Robotics Research Assistant
permalink: /projects/robotics-research-assistant/
date: 2023-03-20 14:00:00
category: work
importance: 3
description: Provably safe human-robot interaction research with a safety shield at TUM's Cyber-Physical Systems Group.
youtubeId1: o9mqPGoEh-8
youtubeId2: 8Qk5CZ4iBEY
youtubeId3: qdXKxIg1hYU
youtubeId4: ldvWMJVBLa0
---

I've worked as a robotics research assistant for the [Cyber-Physical Systems Group](https://www.ce.cit.tum.de/cps/home/) on making physical human-robot interaction (pHRI) provably safe with formal verification for over a year. pHRI is a promising research direction which has many useful application scenarios such as service care and construction robotics. We would like to have robots that can not only manipulate its environment, but can also interact with humans. To deploy such a system in a real environment, safety for the humans must be guaranteed. We achieve this by combining a low-frequency AI/RL-based planner with a high-frequency provably safe controller, called the [safety shield](https://github.com/JakobThumm/sara-shield). The RL controller tells the robot where to move to, while the safety shield executes the trajectory in a safe way. Our safety shield is the first of its kind, providing provable safety for continuous action spaces in high-dimensional state-spaces and unpredictable dynamic environments. It can be applied to a variety of manipulation tasks and is highly effective in quickly reacting to highly dynamic human motion. For my bachelor-thesis, we implemented a new version of the safety shield, enabling provably safe pHRI in close interactions with a human. I was offered a position to continue working on the project. Our research was funded by the EU project [CONCERT](https://cordis.europa.eu/project/id/101016007) (CONfigurable CollaborativE Robot Technologies).

## Problem Definition

My advisor and supervisor, Jakob Thumm M.Sc and Prof. Matthias Althoff, have implemented the safety shield following the ISO-defined safety norm of speed and separation monitoring (SSM). With SSM, no collisions are allowed. Therefore, the robot must stop if a collision with a human is possible. In the video below, you can see how the SSM safety shield performs in a simulated scenario. 

{% include youtubePlayer.html id= page.youtubeId1%}

The robot succesfully brakes if the human could collide with the robot. One problem however is that due to SSM, the robot cannot move at all if a human is too close because the robot needs to prevent all possible collisions. In the scenario below, the robot is not able to move past the human, even though he wouldn't collide with the human (under the assumption that the human doesn't move).

{% include youtubePlayer.html id= page.youtubeId2%}

The goal is to enlarge the robot's operable space and to enable close interactions by implementing a new version of the safety shield, which follows the ISO-defined safety norm of power and force limiting (PFL). With PFL, collisions are allowed, but they need to comply with threshold limits to prevent risk of injury for the human. One such limit is the safety-rated reduced velocity, where we would not only limit the impact velocity if a collision happens, but the robot would also move so slow that the human could safely move away.

## Method

Key methods underpinning the controller are online verification, reachability analysis and failsafe planning. The reason why the controller is provably safe is similar to an online induction proof. First, we assume that we execute an already verified action. During the execution of the current action, we construct and verify the next possible action. If an action is safe or not, is verified with reachability analysis. We calculate the reachable sets of the human and the robot for the next time step and check if the reachable occupancies don't intersect with each other. If an action is not safe, we execute a failsafe action which was verified in the previous time step. In this problem context, a failsafe action is done via scaling the velocity of the trajectory. If we can assume that the robot starts in a safe state and that we can always construct a failsafe action, the robot is provably safe for an infinite time horizon.

We verify according to two safety criteria. The first safety criterion is defined as the PFL criterion. The PFL criterion ensures that there are no collisions where the robot’s impact velocity is above the safety-rated speed. The second criterion, called the static human criterion, ensures that the robot does not collide with the human, even when the robot is under the safety-rated speed. The static criterion assumes that the human does not move in the time interval, hence its name. We calculate two possible failsafe actions such that the robot can choose the appropriate action depending on which safety criterion is unsafe. We have a failsafe action for the static criterion, called the full stop failsafe action, where the robot brakes to a full stop, and a failsafe action for the PFL criterion, called the PFL failsafe action. With the PFL failsafe action, the robot reduces its speed such that its maximum Cartesian velocity is under the safety-rated speed. 

## Results

In the video below, you can see how the PFL safety shield improves on the scenario from above in comparison to the SSM safety shield. The robot is now able to move around closer to the human and automatically adjusts its speed depending on how close it is to the human.

{% include youtubePlayer.html id= page.youtubeId3%}

## References

For more information, I refer to a previous paper of my advisor and his presentation video

- Provably Safe Deep Reinforcement Learning for Robotic Manipulation in Human Environments [[IEEExplore]](https://ieeexplore.ieee.org/document/9811698) [[Arxiv]](https://arxiv.org/abs/2205.06311)

{% include youtubePlayer.html id= page.youtubeId4%}
