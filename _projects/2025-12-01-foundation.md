---
layout: page
title: Master's Thesis with Foundation on Language-Guided Humanoid Manipulation
permalink: /projects/foundation/
date: 2025-12-01 14:00:00
category: work
---

My thesis is a collaboration between [Prof. Cristina Piazza's group](https://www.ce.cit.tum.de/nhcr/members/cpiazza/) at TUM MIRMI and Prof. Patrick van der Smagt's group at [Foundation](https://foundation.bot/).

Manipulation, the ability to grasp various objects and manipulate them in a task-oriented manner, such as using objects as tools, is one of the key fundamental skills of humans. A longstanding goal in AI research is to endow robotic systems with the same manipulation capabilities as humans, hence designing humanoid robots equipped with dexterous hands and human-like proportions. Most industrial robots, in contrast, are equipped with simple-to-control grippers, e.g., parallel jaw grippers or suction devices. With these grippers, one only needs to control when to open or close them and with what gripping strength. 

In comparison, dexterous hands are far more challenging to control, as they possess significantly more degrees of freedom (DoFs): a Franka Panda, an industrial robotic arm often used in research, has 7 DoFs, whereas dexterous hands such as the Shadow Hand or ORCA Hand have many more joints, reaching up to 20 DoFs. Despite the increased complexity of this problem, decades of research in dexterous manipulation have emerged, focusing on analytical and model-based approaches in state estimation, motion planning, and control. 

For example, classical model-based methods calculate viable dexterous grasps by evaluating candidate grasps against physical and geometric metrics such as force closure, which can be determined analytically. While model-based approaches have made significant progress, they have so far lacked the ability to tackle semantic reasoning, which a robot needs for task-oriented grasping. For example, depending on the intention, a robot must grasp a knife differently: it must hold the knife by the handle if the robot intends to use the knife as a cutting tool. If the goal is to hand the knife over to a person, the robot needs to take the safety of the human into account. Incorporating this kind of common-sense reasoning has not been feasible with model-based approaches. 

In recent years, a new kind of learning-based approach has emerged: large, deep learning models trained on vast internet-scale datasets and compute, with language as the unifying modality, known as foundation models. Large Language Models (LLMs) and Vision-Language Models (VLMs) exhibit capabilities of semantic reasoning. For example, depending on the task, they can determine the appropriate object part to be grasped. The LLM lists all subparts given an object and chooses the one part that is most suitable for grasping, based on a task instruction that is either defined by the user or inferred by the LLM itself.

Current foundation models are trained with 2D vision assets (images, videos, etc.). These have been effectively used in robotics problems to enhance their reasoning capabilities; however, the physical environments in which robots interact are inherently 3D, not 2D. Therefore, roboticists need models that are grounded in the 3D physical world and can reason with 3D interactions, shapes, and distances. 3D foundation models (3D-FMs) trained on 3D assets, such as point cloud data, are an active research area where their application in robotics is still in its infancy, but holds great promise.

Given the recent advances in 3D-FM and their emerging capabilities for semantically-driven spatial reasoning, this thesis aims to utilize 3D-FMs to combine 3D-grounded semantic reasoning with physically feasible grasp planning for task-oriented, dexterous manipulation.