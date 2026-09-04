---
layout: default
title: Play against my RL Pong agent
permalink: /pong/
---
<script src="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js"></script>
{% include pong-content.html model_url='/assets/pong/pong_policy.onnx' %}
<script src="{{ '/assets/pong/pong.js' | relative_url }}"></script>
