# Deployment Guide

This guide covers deploying the Discord Surveillance Bot to various environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Docker Deployment](#docker-deployment)
- [Railway Deployment](#railway-deployment)
- [Production Checklist](#production-checklist)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Docker and Docker Compose (for Docker deployment)
- Railway account (for Railway deployment)
- PostgreSQL database
- Redis cache (optional but recommended)
- Discord bot application

## Environment Variables

### Required Variables

```env
# Discord
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_guild_id
OWNER_ID=your_user_id

# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# AI (optional)
OPENROUTER_API_KEY=your_api_key
```

### Optional Variables

```env
# Redis
REDIS_URL=redis://host:6379

# Monitoring
SENTRY_DSN=your_sentry_dsn

# Health Check Port
CONTROL_PORT=3000

# Metrics Port
METRICS_PORT=3005
```

## Docker Deployment

### Building the Image

```bash
docker build -t discord-surveillance-bot .
```

### Running with Docker Compose

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  bot:
    build: .
    container_name: discord-bot
    restart: unless-stopped
    environment:
      - DISCORD_TOKEN=${DISCORD_TOKEN}
      - DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID}
      - DISCORD_GUILD_ID=${DISCORD_GUILD_ID}
      - OWNER_ID=${OWNER_ID}
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - SENTRY_DSN=${SENTRY_DSN}
    ports:
      - "3000:3000"  # Health check
      - "3005:3005"  # Metrics
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    container_name: bot-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=discord_bot
      - POSTGRES_PASSWORD=discord_bot
      - POSTGRES_DB=discord_bot
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: bot-redis
    restart: unless-stopped
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

Run with:

```bash
docker-compose up -d
```

## Railway Deployment

### 1. Create a New Project

1. Go to [Railway](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"

### 2. Configure Environment Variables

Add the following environment variables in Railway:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID`
- `OWNER_ID`
- `DATABASE_URL` (Railway will provide this when you add PostgreSQL)
- `REDIS_URL` (Railway will provide this when you add Redis)

### 3. Add Services

#### PostgreSQL

1. Click "New Service"
2. Select "PostgreSQL"
3. Railway will provide the `DATABASE_URL`

#### Redis

1. Click "New Service"
2. Select "Redis"
3. Railway will provide the `REDIS_URL`

### 4. Deploy

Railway will automatically deploy when you push to the connected branch.

### 5. Configure Health Check

Add a health check in Railway settings:
- Path: `/health`
- Port: `3000`
- Interval: `30s`

## Production Checklist

Before deploying to production, ensure:

- [ ] All environment variables are set
- [ ] Database migrations are applied
- [ ] Discord commands are registered
- [ ] Sentry is configured for error tracking
- [ ] Health check endpoint is accessible
- [ ] Metrics endpoint is accessible
- [ ] Rate limiting is configured
- [ ] Logging is configured for JSON output
- [ ] SSL/TLS is enabled for database connections
- [ ] Backup strategy is in place for database
- [ ] Monitoring is set up (Sentry, Prometheus, etc.)

## Monitoring

### Health Check

The bot exposes a health check endpoint:

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "uptime": 1234.56,
  "memory": {
    "rss": 12345678,
    "heapUsed": 9876543
  },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "checks": {
    "database": true,
    "discord": true,
    "services": true
  }
}
```

### Metrics

Prometheus metrics are available at:

```bash
curl http://localhost:3005/metrics
```

### Endpoints

- `GET /health` - Basic health check
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe
- `GET /health/detailed` - Full health check with all modules
- `GET /metrics` - Prometheus metrics

## Troubleshooting

### Bot Won't Start

1. Check environment variables are set correctly
2. Verify Discord token is valid
3. Check database connection
4. Review logs: `docker logs <container_name>`

### Commands Not Registering

1. Ensure `DISCORD_CLIENT_ID` is correct
2. Run `npm run register-commands`
3. Check bot has necessary permissions

### Database Connection Issues

1. Verify `DATABASE_URL` is correct
2. Check database is accessible
3. Ensure SSL is configured if required
4. Check connection pool settings

### High Memory Usage

1. Check for memory leaks in logs
2. Review rate limiting configuration
3. Consider increasing container memory limits
4. Check for unbounded cache growth

### Rate Limiting Issues

1. Review rate limit configuration
2. Check guild-specific settings
3. Verify admin bypass is working correctly
4. Monitor rate limit metrics

## Scaling

### Horizontal Scaling

For multiple instances:

1. Use a shared Redis instance for caching
2. Use a shared PostgreSQL database
3. Configure load balancer
4. Ensure health checks are configured
5. Use consistent hashing for rate limiting

### Vertical Scaling

Increase resources:

- CPU: 2+ cores recommended
- Memory: 512MB minimum, 1GB+ recommended
- Disk: 10GB+ for database and logs

## Backup

### Database Backup

```bash
# Using pg_dump
pg_dump $DATABASE_URL > backup.sql

# Using Railway
railway backup
```

### Restore

```bash
# Using psql
psql $DATABASE_URL < backup.sql
```

## Security

- Never commit `.env` files
- Use environment variables for secrets
- Rotate tokens regularly
- Enable 2FA on Discord account
- Use SSL/TLS for all connections
- Keep dependencies updated
- Review security advisories regularly
