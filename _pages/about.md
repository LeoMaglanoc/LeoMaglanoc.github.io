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
      I’m Leo, a robot learning and AI engineer with an M.Sc. in Robotics, Cognition, and Intelligence from TUM. I’ve worked across the robotics and AI stack, with projects spanning language-guided dexterous manipulation for my master’s thesis with a robotics startup, neuromorphic computing at BMW Research, and safe human-robot collaboration at TUM published in IEEE T-RO.
    </p>

    <p>
      Today, I’m focused on foundation models for physical AI and exploring agentic AI through hackathons. Born in Norway and raised in Germany, I’m particularly excited to contribute to Europe’s deep-tech ecosystem and build ambitious robotics and AI systems here.
    </p>

    <p>
      Contact me via <a href="mailto:leo.maglanoc@gmail.com">email</a> ·
      <a href="https://www.linkedin.com/in/leonardo-maglanoc/" target="_blank" rel="noopener">LinkedIn</a>
    </p>
  </div>
</section>

<section class="homepage-section" id="projects" aria-labelledby="projects-title">
  <h2 id="projects-title">Featured Projects</h2>
  {% include homepage_items.liquid items=site.data.homepage.featured_projects %}
</section>

<section class="homepage-section" id="builds" aria-labelledby="builds-title">
  <h2 id="builds-title">Applied AI &amp; Builds</h2>
  {% include homepage_items.liquid items=site.data.homepage.builds %}
</section>

<section class="homepage-section" id="poetry" aria-labelledby="poetry-title">
  <h2 id="poetry-title">Poetry</h2>
  {% include homepage_poetry.liquid %}
</section>
