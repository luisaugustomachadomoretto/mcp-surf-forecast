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
# Stage 2 — dev: full toolchain + sources + MCP Inspector (not for production)
#
# Reuses the build stage (all deps + src/ already present) and launches the
# FastMCP inspector, which wraps @modelcontextprotocol/inspector:
#   - 6274: Inspector web UI
#   - 6277: Inspector proxy server
# The inspector spawns the MCP server itself, so no separate server is needed.
###############################################################################
FROM build AS dev
WORKDIR /app

ENV NODE_ENV=development \
    TZ=UTC \
    # Bind to all interfaces so the UI is reachable from the host via -p.
    # Per the Inspector docs, binding a wildcard host requires this opt-in.
    HOST=0.0.0.0 \
    DANGEROUSLY_BIND_ALL_INTERFACES=true \
    CLIENT_PORT=6274 \
    MCP_SANDBOX_PORT=6277
    # NOTE: auth is intentionally LEFT ON. The Inspector docs warn never to
    # combine DANGEROUSLY_OMIT_AUTH with DANGEROUSLY_BIND_ALL_INTERFACES, since
    # the backend spawns processes. Grab the session token from the container
    # logs (printed at startup) to open the UI.

# 6274 = Inspector web UI, 6277 = MCP Apps sandbox / proxy
EXPOSE 6274 6277

# FastMCP's `dev` script runs an interactive terminal CLI (@wong2/mcp-cli),
# not the web UI. `dev:inspector` is the one that launches the
# @modelcontextprotocol/inspector web server on 6274 (UI) / 6277 (proxy).
CMD ["npm", "run", "dev:inspector"]

###############################################################################
# Stage 3 — runtime: minimal image with production deps + compiled output
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
