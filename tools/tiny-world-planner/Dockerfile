FROM python:3.11-slim-bookworm AS train
ENV PYTHONUNBUFFERED=1 OMP_NUM_THREADS=4 MKL_NUM_THREADS=4
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY tools/tiny-world-planner/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY assets/interactive/tiny-world-planner assets/interactive/tiny-world-planner
COPY tools/tiny-world-planner tools/tiny-world-planner
WORKDIR /workspace/tools/tiny-world-planner
RUN npm ci
CMD ["sh","reproduce_keypoints.sh"]

FROM mcr.microsoft.com/playwright:v1.57.0-noble AS validate
WORKDIR /workspace
COPY assets/interactive/tiny-world-planner assets/interactive/tiny-world-planner
COPY assets/interactive/doom/vendor/ort assets/interactive/doom/vendor/ort
COPY tools/tiny-world-planner tools/tiny-world-planner
WORKDIR /workspace/tools/tiny-world-planner
RUN npm ci
CMD ["sh","-c","npm test && node eval/parity.mjs && node eval/browser.mjs"]
