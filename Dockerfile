# syntax=docker/dockerfile:1

# ============================================
# Webmage - Agentic SEO Village
# Multi-stage build for optimal image size
# ============================================

# Stage 1: Dependencies
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --prefer-offline 2>/dev/null || npm install

# ============================================
# Stage 2: Development
# For local development with hot reload
# ============================================
FROM node:22-alpine AS development

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create output directories
RUN mkdir -p logs output/citations output/outreach output/audits

# Expose nothing - this is a CLI tool
CMD ["npm", "run", "dev"]

# ============================================
# Stage 3: Builder
# Compile TypeScript to JavaScript
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the project
RUN npm run build

# ============================================
# Stage 4: Production
# Minimal image for running the pipelines
# ============================================
FROM node:22-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S webmage -u 1001 -G nodejs

# Copy only production dependencies
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules

# Copy built files
COPY --from=builder /app/dist ./dist

# Create output directories with correct permissions
RUN mkdir -p logs output/citations output/outreach output/audits && \
    chown -R webmage:nodejs logs output

# Switch to non-root user
USER webmage

# Health check - verify node is working
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "console.log('ok')" || exit 1

# Default command runs the village orchestrator
CMD ["node", "dist/cli/run-village.js"]
