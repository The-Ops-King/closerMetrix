# ===== Stage 1: Build the React SPA =====
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ .
RUN npm run build

# ===== Stage 2: Production Server =====
FROM node:20-alpine
WORKDIR /app

# Install server dependencies
COPY package*.json ./
RUN npm ci --production

# Copy server code and shared modules
COPY server/ ./server/
COPY shared/ ./shared/

# Copy built React SPA from stage 1
COPY --from=client-build /app/client/dist ./client/dist

# Cloud Run uses port 8080 by default
EXPOSE 8080

# Start the Express server
CMD ["node", "server/index.js"]
