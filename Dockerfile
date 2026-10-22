# syntax=docker/dockerfile:1

###############################################################################
# Stage 1 — build: install all deps and compile TypeScript to dist/
###############################################################################
FROM node:22-alpine AS build
WORKDIR /app

# Install deps against the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Copy sources and compile. tsc emits dist/ and copies imported JSON data.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

###############################################################################
# Stage 2 — runtime: minimal image with production deps + compiled output
###############################################################################
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    TZ=UTC \
    TRANSPORT=http \
    PORT=3000 \
    HOST=0.0.0.0

# Only production dependencies in the final image.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled server + bundled data from the build stage.
COPY --from=build /app/dist ./dist

# Run as the built-in non-root user for safety.
USER node

EXPOSE 3000

# Lightweight healthcheck: the MCP endpoint rejects a bare GET with 400 once up,
# which still proves the HTTP server is listening (vs connection refused).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/mcp').then(r=>process.exit(r.status?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
