---
layout: default
permalink: /poetry/
title: poetry
nav: true
nav_order: 4
pagination:
  enabled: false
---

<div class="post">
  <div class="header-bar">
    <h1>poetry</h1>
    <h2>A home for poems and verse.</h2>
  </div>

  {% assign poetry_posts = site.poetry %}
  {% if poetry_posts and poetry_posts.size > 0 %}
  {% assign poetry_posts = poetry_posts | sort: 'date' | reverse %}
  <ul class="post-list">
    {% for poem in poetry_posts %}
      <li>
        <h3><a class="post-title" href="{{ poem.url | relative_url }}">{{ poem.title }}</a></h3>
        <p class="post-meta">{{ poem.date | date: '%B %d, %Y' }}</p>
        {% if poem.description %}<p>{{ poem.description }}</p>{% endif %}
      </li>
    {% endfor %}
  </ul>
  {% else %}
    <p>No poetry posts yet.</p>
  {% endif %}
</div>
