---
title: Flappy Bird in a Tiny Canvas
date: 2025-12-29
categories: [blogpost]
tags: [game, canvas, javascript]
_styles: |
  .flappy-frame {
    display: grid;
    place-items: center;
    margin: 1.5rem 0 2rem;
  }
  .flappy-embed {
    width: min(92vw, 420px);
    aspect-ratio: 9 / 16;
    border: 0;
    border-radius: 18px;
    background: #0b1020;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
  }
  .flappy-note {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.72);
    text-align: center;
  }
---

A tiny, single-file Flappy Bird clone built on canvas with mobile-friendly controls and frame-rate independent physics.

<div class="flappy-frame">
  <iframe class="flappy-embed" src="{{ '/assets/interactive/flappy/index.html' | relative_url }}" title="Flappy Bird clone" loading="lazy"></iframe>
</div>

<p class="flappy-note">Tap/click or press Space to flap. Press R to restart. <a href="{{ '/assets/interactive/flappy/index.html' | relative_url }}">Open in a new tab</a>.</p>
