---
layout: homepage
title: about
permalink: /
nav_order: 1
---

<section class="homepage-hero" aria-labelledby="homepage-title">
  <div class="homepage-hero-image">
    {% include figure.liquid loading="eager" path="assets/img/prof_pic.jpg" class="img-fluid z-depth-1 rounded" alt="Portrait of Leonardo Maglanoc" %}
  </div>

  <div class="homepage-hero-copy">
    <h1 id="homepage-title">Leonardo Maglanoc</h1>

    <p>
      I'm Leo, a Robotics & AI Engineer with an M.Sc. in Robotics, Cognition, Intelligence from TUM. My background spans robot learning (RL/IL), robotics software development (Python, C++, ROS 2), and 3D perception/SLAM. I've worked on language-guided dexterous manipulation with Foundation Robotics, brain-inspired ML at BMW Research, and safe human-robot collaboration at TUM, contributing to a publication in IEEE Transactions on Robotics.
    </p>

    <p>
      Beyond robotics, I enjoy exploring agentic AI through personal projects and hackathons. Born in Norway and raised in Germany, I'm excited to contribute to Europe's deep-tech ecosystem and build ambitious robotics and AI systems here.
    </p>

    <p>
      <a href="mailto:leo.maglanoc@gmail.com">email</a> ·
      <a href="https://www.linkedin.com/in/leonardo-maglanoc/" target="_blank" rel="noopener">LinkedIn</a> ·
      <a href="https://github.com/{{ site.data.socials.github_username }}" target="_blank" rel="noopener">GitHub</a> ·
      <a href="{{ site.data.socials.cv_pdf | relative_url }}" target="_blank" rel="noopener">CV</a>
    </p>

  </div>
</section>

<section class="homepage-section" id="projects" aria-labelledby="projects-title">
  <h2 id="projects-title">Selected Work</h2>
  {% include homepage_items.liquid items=site.data.homepage.featured_projects %}
</section>

<section class="homepage-section" id="builds" aria-labelledby="builds-title">
  <h2 id="builds-title">Applied AI &amp; Builds</h2>
  <p class="homepage-demos-intro">Interactive demos built with coding agents. Click and run in your browser.</p>
  {% include homepage_demos.liquid %}
  {% include homepage_items.liquid items=site.data.homepage.builds %}
</section>

<section class="homepage-section" id="poetry" aria-labelledby="poetry-title">
  <h2 id="poetry-title">Poetry</h2>
  {% include homepage_poetry.liquid %}
</section>
