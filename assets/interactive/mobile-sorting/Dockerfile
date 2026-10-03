FROM mcr.microsoft.com/playwright:v1.57.0-noble
WORKDIR /tools
RUN npm init -y && npm install --save-exact playwright@1.57.0
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/robot-tools && /opt/robot-tools/bin/pip install --no-cache-dir mujoco==3.3.7 trimesh==4.8.3 fast-simplification==0.1.12
ENV NODE_PATH=/tools/node_modules PATH="/opt/robot-tools/bin:${PATH}"
WORKDIR /workspace/assets/interactive/mobile-sorting
