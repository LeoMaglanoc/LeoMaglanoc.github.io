FROM mcr.microsoft.com/playwright:v1.57.0-noble
WORKDIR /tools
RUN npm init -y && npm install --save-exact playwright@1.57.0
ENV NODE_PATH=/tools/node_modules
WORKDIR /workspace
