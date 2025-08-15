# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Install dependencies:**
```bash
bun install
```

**Run the token service (with automatic refresh):**
```bash
bun start
```

**Run the CLI:**
```bash
bun run tokens <command>
```

**Database operations:**
```bash
# Generate Prisma client after schema changes
bunx prisma generate

# Create and apply migrations
bunx prisma migrate dev --name <migration_name>

# Reset database (development only)
bunx prisma migrate reset
```

## Architecture Overview

This is a **Lightspeed token management service** built with Bun, TypeScript, and Prisma. The service handles secure storage and automatic refresh of Lightspeed API tokens.

### Core Components

- **Database Layer (`db/connection.ts`)**: Prisma client configuration with development/production environment handling and query logging
- **Token Service (`services/token-service.ts`)**: Main business logic for token management, encryption, and automatic refresh
- **Database Schema (`prisma/schema.prisma`)**: PostgreSQL schema with encrypted token storage and proper indexing

### Key Architecture Patterns

1. **Token Encryption**: All tokens are encrypted using AES-256-CBC before database storage
2. **Automatic Refresh**: Tokens are automatically refreshed 10 minutes before expiry
3. **Database Connection Management**: Global Prisma instance in development to prevent hot-reload issues
4. **Generated Client Output**: Prisma client generates to `generated/prisma/` directory

### Environment Variables Required

- `DATABASE_URL`: PostgreSQL connection string
- `TOKEN_ENCRYPTION_KEY`: 32-byte hex string for AES encryption
- `LIGHTSPEED_CLIENT_ID`: OAuth client ID for Lightspeed API
- `LIGHTSPEED_CLIENT_SECRET`: OAuth client secret for Lightspeed API

### Database Schema

The `lightspeedTokens` table stores:
- Encrypted access and refresh tokens
- Token expiration timestamps
- Indexes on critical fields for performance

### Automatic Token Management

The service includes a **TokenScheduler** that:
- **Refreshes tokens automatically** every 5 minutes (before expiry)
- **Health checks** every hour with status logging
- **Graceful shutdown** handling for SIGINT/SIGTERM

### CLI Commands

- `bun run tokens login <auth_code>` - Initial token setup from OAuth code
- `bun run tokens status` - View token status and expiry
- `bun run tokens refresh` - Force token refresh
- `bun run tokens clear` - Clear all stored tokens

### Service Methods

The `LightspeedTokenService` provides:
- `getValidAccessToken()`: Returns valid access token, auto-refreshing if needed
- `insertTokens()` / `updateTokens()`: Secure token storage with encryption
- `getTokenStatus()`: Monitoring and health check capabilities
- `validateTokens()`: Token validation and configuration check

### Production Deployment Options

#### 1. PM2 Process Manager (Recommended for Node.js environments)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
bun run pm2:start

# Monitor
bun run pm2:status
bun run pm2:logs

# Control
bun run pm2:restart
bun run pm2:stop
```

#### 2. Docker with Auto-Restart

```bash
# Build and run with Docker Compose
bun run docker:build
bun run docker:run

# Monitor logs
bun run docker:logs

# Stop
bun run docker:stop
```

#### 3. Systemd Service (Linux servers)

```bash
# Install as system service
sudo ./scripts/install-systemd.sh

# Control service
sudo systemctl start lightspeed-token-service
sudo systemctl enable lightspeed-token-service
sudo systemctl status lightspeed-token-service

# View logs
journalctl -u lightspeed-token-service -f
```

### Auto-Restart Features

- **PM2**: Automatic restarts on failure, memory monitoring, log rotation
- **Docker**: `restart: unless-stopped` policy with health checks
- **Systemd**: `Restart=always` with exponential backoff
- **All methods**: Graceful shutdown handling and health monitoring

### Production Usage

The scheduler automatically:
- Checks tokens every 5 minutes
- Refreshes tokens 10 minutes before expiry  
- Logs health status every hour
- Restarts on failure with the deployment method you choose