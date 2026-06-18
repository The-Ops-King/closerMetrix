# CloserMetrix API — Cloud Run Dockerfile
#
# Multi-stage build for minimal production image.
# Node.js 22 LTS on Alpine for small footprint.
#
# Node is PINNED to 22.22.3, not the floating `22-alpine` tag. Node 22.23.0
# (which `22-alpine` rolled forward to on 2026-06-18) regressed node-fetch v2's
# gzipped-response handling: every BigQuery REST call (and other node-fetch v2
# traffic) fails mid-stream with "Invalid response body ... Premature close",
# taking down all client lookups and webhooks. 22.22.3 is the exact runtime the
# last-known-good revision (00161, 2026-06-11) shipped on. Re-pin/re-test
# deliberately before bumping Node.
FROM node:22.22.3-alpine AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci --production

# Copy source code
COPY src/ ./src/

# ── Production image ──────────────────────────────
# Pinned to 22.22.3 — see header note (22.23.0 breaks node-fetch gzip / BigQuery).
FROM node:22.22.3-alpine

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json

# Cloud Run sets PORT=8080
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# Start the server
CMD ["node", "src/index.js"]
