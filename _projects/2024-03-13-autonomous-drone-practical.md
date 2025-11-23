---
layout: page
title: Autonomous Drone Practical
permalink: /projects/autonomous-drone-practical/
date: 2024-03-13 14:00:00
category: work
importance: 2
description: Visual-inertial navigation project with AR Drone 2, A* planning, and haptic goal control.
img: assets/img/drone_software_architecture.PNG
youtubeId1: G10pKZ9_a9o
youtubeId2: pHPrIKNTFPE
---

For my studies, I'm focusing on perception and control of mobile robots. That's why I participated in the [Remote Machine Intelligence Practical](https://srl.cit.tum.de/teaching/w23/rmilpracticals) of the Smart Robotics Lab at TUM. The goal was for the user to be able to set the goal postion with a haptic device, the Novint Falcon Haptic Device, and then an AR Drone 2 to autonomously reach the goal while avoiding obstacles. In the image below, you can see an overview of the software architecture. 

<div class="text-center">
  {% include figure.liquid loading="eager" path="assets/img/drone_software_architecture.PNG" class="img-fluid rounded z-depth-1" max-width="900px" %}
</div>

The visual-inertial EKF localizer, the pre-recorded landmarks, and pre-recorded occupancy map were already a part of the lab code base. The haptic handler, path planner and PID controller were implemented by us as part of the project. 

The user interacts with our system via the haptic controller. The user can set the goal position with the haptic handler. Then the A-star path planner uses that + current pose + occupancy map to calculate a list of collision-free waypoints which is used by the PID controller. The PID controller tries to reach each waypoint (depending on the deviation between current pose and waypoint) and sends the commands to the drone. The drone executes the commands and sends its sensor data consisting of camera feed and inertial measurments from the IMU to the localizer. The current pose is then estimated with the extended kalman filter algorithm (EKF) with the help of pre-recorded landmarks.

## Results

The video below showcases our system in a real lab setting. In the beginning, I'm setting the new goal position with the haptic controller in front of the obstacle in the middle of the room. The drone is able to reach it, albeit while hovering for a while around the last waypoint.

{% include youtubePlayer.html id= page.youtubeId1%}

The video below showcases our system in a simulated setting in Gazebo. The lower left window is the camera feed, the upper left window is the terminal, and the right window is RVIZ, where we can see the estimated drone position and can set the goal position. I'm purposefully setting the goal position in occupied space (inside the table/chairs), which is why the marker is moved to the nearest free space (above the chairs). The drone is able to calculate a collision-free path, follow it, and reach the goal position.

{% include youtubePlayer.html id= page.youtubeId2%}
