FROM oven/bun:1-alpine

# Create app directory
WORKDIR /usr/src/app

# Create logs directory
RUN mkdir -p logs

# Install dependencies
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S bun -u 1001

# Change ownership of the app directory
RUN chown -R bun:nodejs /usr/src/app
USER bun

# Expose port (if needed for health checks)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun run cli.ts status || exit 1

# Start the application
CMD ["bun", "run", "server.ts"]