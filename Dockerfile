# ==============================================================================
# Stage 1: Build the Web PWA (React 19 + TypeScript + Vite)
# ==============================================================================
FROM node:22-alpine AS web-builder
WORKDIR /app/web

# Install build dependencies
COPY web/package.json web/package-lock.json ./
RUN npm install

# Build the client bundle
COPY web/ ./
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# ==============================================================================
# Stage 2: Build the Backend API Server (Node.js + TypeScript + esbuild)
# ==============================================================================
FROM node:22-alpine AS backend-builder
WORKDIR /app/backend

# Install backend dependencies
COPY backend/package.json backend/package-lock.json ./
RUN npm install

# Bundle the backend server into a single lightweight executable
COPY backend/ ./
RUN npm run build

# ==============================================================================
# Stage 3: Minimal, Clean & Secure Production Runner
# ==============================================================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV STORAGE_PATH=/app/storage
ENV STATIC_DIR=/app/web/dist

# Install only the runtime database driver (pg)
RUN npm init -y && \
    npm pkg set type=module && \
    npm install --omit=dev pg@8.13.3 && \
    rm -rf /root/.npm

# Copy built artifacts from builder stages
COPY --from=web-builder /app/web/dist /app/web/dist
COPY --from=backend-builder /app/backend/dist /app/backend/dist

# Setup persistent storage directory with proper permissions
RUN mkdir -p /app/storage && \
    chown -R node:node /app

# Run as non-root user for security
USER node

EXPOSE 3000

# Health check using lightweight busybox wget
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "/app/backend/dist/server.js"]
