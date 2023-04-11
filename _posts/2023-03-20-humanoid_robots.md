---
title: My Research Dream
date: 2023-03-20 14:00:00
categories: [blogpost]
tags: [research]     
youtubeId1: XPVC4IyRTG8
youtubeId2: zjsdCiOAjNA
---

As a robotics enthusiast, my long term research dream is to enable humanoid robots that can collaborate with humans and assist us where needed.

## Why Humanoid Robots?

One of the reasons why I find humanoid robots fascinating is from a philosophical standpoint: humans are most interested in understanding themselves. Therefore, designing robots based on the human form can help us understand ourselves better.

From an application standpoint, humanoid robots can be helpful in many scenarios such as assisting the elderly or disabled, performing tasks in hazardous environments, or even serving as companions for those in need of social interaction.

Moreover, studying humanoid robots provides a rich research space with many interesting problems to solve. For example, one of the most neglected types of intelligence in robotics is emotional intelligence, and humanoid robots could help us explore this field. Another area of research is motor control intelligence, which would allow robots to move more like humans.

## Inspiration for Problems

To achieve this goal, some of the major problems that need to be solved include perception, planning, and control. By improving these areas, we can enable robots to interact with humans in a more intuitive and natural way.

Robotics engineers need to be more inspired by biological systems, and more specifically by humans. Virtually all problems roboticists tackle, humans can already achieve very well. Therefore, robotics research should aim to replicate the abilities of humans to enable robots to interact with the world as we do. One inspiration  might be the physical construction of the robot and how to control its mechanics. Another inspiration can be brain-inspired algorithms that mimic the navigational skills of a human.

### Bipedal Locomotion

Deciding what mechanical body of the robot is suitable depends on the task, the terrain, and the environment. For example, robotic rats can be used in disaster situations to inspect hard-to-reach locations to find missing humans. Humanoid robots have been prevalent in common literature for a long time, such as in "Star Wars", but they recently also gained popularity in research. For example, Boston Dynamics unveiled the [Atlas Robot](https://www.darpa.mil/about-us/timeline/debut-atlas-robot), a robot in humanoid form, for the DARPA Robotics Challenge in 2013. The significant advantage of a human form is that a humanoid robot would be able to move through many environments designed for humans, such as cities, buildings, and many more. Before widely adopting the human form, we need to solve biped walking locomotion. Humans and other animals are very good at maintaining balance when walking. Replicating that in a robotic system is still very hard.

One common approach to this is the so-called Zero Motion Point concept[^zero-motion-point]. The idea is to exploit moments of foot contact with the ground to create an equilibrium between horizontal inertia and gravity forces. If one looks at robots using this method, e.g., the Asimo robot by Honda, one might get the impression that it walks in a very controlled but conservative way. The stiff walking is due to the dynamics-canceling approach of the Zero Motion Point method. Passive-dynamic walkers use an alternative approach. They are simplistic mechanical devices that can stably walk down a slope without motors or controllers. Despite that, they have remarkably humanlike motions in comparison to Asimo’s walking. Research in that area is also being done at TUM by the Chair of Applied Mechanics. They use the [LOLA robot](https://www.darpa.mil/about-us/timeline/debut-atlas-robot) to learn more about the dynamics, real-time motion planning, and control of anthropomorphic walking robots.

### Brain-Inspired Navigation

Mechanically actuating the robot to induce a specific movement is only a tiny part of the bigger problem. The robot also needs to know how to navigate different environments. SLAM is the abbreviation for Simultaneous Localization and Mapping. Being able to map out the environment and localize where one is in that map is integral for a mobile robot to move around in an environment. Robots need SLAM algorithms in various situations, in more complicated problems such as self-driving cars or simpler problems such as indoor vacuum cleaning robots. Common approaches use probabilistic methods like the extended Kalman Filter or Monte Carlo Localization. Especially in unknown and dynamic environments, it is still challenging to solve the SLAM problem algorithmically[^slam-survey]. However, humans can navigate in rich and complex environments. Therefore it makes sense to design SLAM algorithms that are biologically inspired. In a recent paper by Genghang Zhuang et al. from TUM, they sought inspiration from the hippocampus to design a new brain-inspired SLAM
algorithm[^tum-slam].

Neuroscience research has shown that hippocampal cells, like place cells, grid cells, and head direction cells, play an essential role in the navigational skills of an animal[^moser]. One model from the TUM paper draws inspiration from place cells and head direction cells. Place cells collectively build a cognitive representation of the environment by firing at specific places on a map. They are orientation-invariant and location-specific. On the other hand, head direction cells are orientation-specific and location-invariant because they track the animal’s current head direction without considering the map. Both systems combined help the animal localize where he is in his current environment and in what direction his head is facing. The experiments from the TUM paper testing their bio-inspired localization system combined with a Lidar sensor showed promising results.

## Some interesting videos

If you are interested in humanoid robots as much as I am, check out some of these interesting videos to learn more:

{% include youtubePlayer.html id= page.youtubeId1%}
key takeaway: model-predictive control is cool.

{% include youtubePlayer.html id= page.youtubeId2%}
key takeaway: cocomotion and vision are intertwined.

## References

[^zero-motion-point]: C. C. Kemp, P. Fitzpatrick, H. Hirukawa, K. Yokoi, K. Harada, and Y. Matsumoto.“Humanoids.” In: Springer Handbook of Robotics. Ed. by B. Siciliano and O. Khatib. Berlin, Heidelberg: Springer Berlin Heidelberg, 2008, pp. 1307–1333. isbn: 978-3-540-30301-5.
[^slam-survey]:  C. Cadena, L. Carlone, H. Carrillo, Y. Latif, D. Scaramuzza, J. Neira, I. Reid, and J. J. Leonard. “Past, Present, and Future of Simultaneous Localization and Mapping: Toward the Robust-Perception Age.” In: IEEE Transactions on Robotics 32.6 (2016), pp. 1309–1332.
[^tum-slam]:  G. Zhuang, C. Cagnetta, Z. Bing, K. Huang, and A. C. Knoll. “A Biologically Inspired Global Localization System for Mobile Robots Using LiDAR Sensor.” In: CoRR abs/2109.12928 (2021). arXiv: 2109.12928.
[^moser]: E. I. Moser, E. Kropff, and M.-B. Moser. “Place Cells, Grid Cells, and the Brain’s Spatial Representation System.” In: Annual Review of Neuroscience 31.1 (2008). PMID: 18284371, pp. 69–89.
