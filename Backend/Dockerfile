# CloserMetrix API — Cloud Run Dockerfile
#
# Multi-stage build for minimal production image.
# Node.js 22 LTS on Alpine for small footprint.

FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci --production

# Copy source code
COPY src/ ./src/

# ── Production image ──────────────────────────────
FROM node:22-alpine

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
