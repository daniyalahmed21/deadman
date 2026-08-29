# Shared image for the DEADMAN stack (engine + frontends). One install of the pnpm workspace,
# plus kubectl for the engine's cluster backend. Services pick their command in docker-compose.yml.
FROM node:22-bookworm-slim

# kubectl — the engine shells out to it to drive the cluster.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/v1.34.0/bin/linux/amd64/kubectl" \
 && chmod +x /usr/local/bin/kubectl \
 && apt-get purge -y curl && apt-get autoremove -y && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.0.8 --activate

WORKDIR /app
# Copy the whole workspace (node_modules excluded via .dockerignore) and install fresh Linux deps.
COPY . .
RUN pnpm install

# 9000 engine · 5173 cockpit · 5174 console
EXPOSE 9000 5173 5174
