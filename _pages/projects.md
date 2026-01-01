---
layout: default
title: projects
permalink: /projects/
description: Robotics and AI projects I'm working on.
nav: true
nav_order: 4
display_categories: [work]
---

<!-- pages/projects.md -->
<div class="post projects">

{% assign projects_title_size = page.title | size %}
{% assign projects_description_size = page.description | size %}

{% if projects_title_size > 0 or projects_description_size > 0 %}
  <div class="header-bar">
    <h1>{{ page.title }}</h1>
    <h2>{{ page.description }}</h2>
  </div>
{% endif %}

{% if site.enable_project_categories and page.display_categories %}
  <div class="tag-category-list">
    <ul class="p-0 m-0">
      {% for category in page.display_categories %}
        <li>
          <i class="fa-solid fa-tag fa-sm"></i>
          <a href="{{ category | slugify | prepend: '#category-' }}">{{ category }}</a>
        </li>
        {% unless forloop.last %}
          <p>&bull;</p>
        {% endunless %}
      {% endfor %}
    </ul>
  </div>
{% endif %}

{% assign sorted_projects = site.projects | sort: "date" | reverse %}
{% if site.enable_project_categories and page.display_categories %}
  {% assign filtered_projects = sorted_projects | where_exp: "project", "page.display_categories contains project.category" %}
{% else %}
  {% assign filtered_projects = sorted_projects %}
{% endif %}

<ul class="post-list">
  {% assign current_category = "" %}
  {% for project in filtered_projects %}
    {% assign project_category = project.category | default: "" %}
    {% assign is_new_category = false %}
    {% if project_category != "" and project_category != current_category %}
      {% assign is_new_category = true %}
      {% assign current_category = project_category %}
    {% endif %}
    <li{% if is_new_category %} id="category-{{ project_category | slugify }}"{% endif %}>
      <h3>
        {% if project.redirect == blank %}
          <a class="post-title" href="{{ project.url | relative_url }}">{{ project.title }}</a>
        {% elsif project.redirect contains '://' %}
          <a class="post-title" href="{{ project.redirect }}" target="_blank" rel="noopener">{{ project.title }}</a>
          <svg width="2rem" height="2rem" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 13.5v6H5v-12h6m3-3h6v6m0-6-9 9" class="icon_svg-stroke" stroke="#999" stroke-width="1.5" fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        {% else %}
          <a class="post-title" href="{{ project.redirect | relative_url }}">{{ project.title }}</a>
        {% endif %}
      </h3>
      {% if project.description %}
        <p>{{ project.description }}</p>
      {% endif %}
      <p class="post-meta">
        {{ project.date | date: '%B %d, %Y' }}
      </p>
      {% if project_category != "" %}
        <p class="post-tags">
          <i class="fa-solid fa-tag fa-sm"></i> {{ project_category }}
        </p>
      {% endif %}
    </li>
  {% endfor %}
</ul>
</div>
