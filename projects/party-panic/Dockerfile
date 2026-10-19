# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=proxy_ca NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci --strict-ssl=true
COPY . .
RUN npm run typecheck && npm run lint && npm test && npm run build
FROM nginx:1.28-alpine
COPY --from=build /app/dist /usr/share/nginx/html/party-panic
EXPOSE 80
