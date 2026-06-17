# Architecture Documentation

This document describes the architecture of the Discord Surveillance Bot.

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Component Architecture](#component-architecture)
- [Data Flow](#data-flow)
- [Technology Stack](#technology-stack)
- [Design Patterns](#design-patterns)
- [Security](#security)
- [Scalability](#scalability)

## Overview

The Discord Surveillance Bot is a modular Discord bot built with TypeScript, Node.js, and Discord.js. It provides surveillance, moderation, AI features, and gaming integration for Discord servers.

### Key Principles

- **Modularity**: Each feature is a separate module
- **Type Safety**: TypeScript for compile-time type checking
- **Observability**: Comprehensive logging, metrics, and health checks
- **Resilience**: Error handling, rate limiting, and circuit breakers
- **Performance**: Caching, connection pooling, and async operations

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Discord API                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Discord.js Client                         │
│  - Event Handlers (messages, members, interactions)         │
│  - Command Router                                            │
│  - Rate Limiter                                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Commands    │  │   Services   │  │   Managers   │      │
│  │              │  │              │  │              │      │
│  │ - Moderation │  │ - AI Chat    │  │ - Channel    │      │
│  │ - Gaming     │  │ - Monitor    │  │ - Scraper    │      │
│  │ - Security   │  │ - Feeds      │  │ - Alert      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Events     │  │    Cron      │  │  Middleware  │      │
│  │              │  │              │  │              │      │
│  │ - Messages   │  │ - Deals      │  │ - Whitelist  │      │
│  │ - Members    │  │ - Free Games │  │ - Logging    │      │
│  │ - Channels   │  │ - Twitter    │  │ - Rate Limit │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  PostgreSQL  │  │    Redis     │  │   External   │      │
│  │   (Prisma)   │  │    Cache     │  │     APIs     │      │
│  │              │  │              │  │              │      │
│  │ - Sources    │  │ - Rate Limit │  │ - OpenRouter │      │
│  │ - Alerts     │  │ - API Cache  │  │ - RAWG       │      │
│  │ - Guilds     │  │ - Sessions   │  │ - Steam      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                 Infrastructure & Monitoring                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Winston    │  │  Prometheus  │  │   Sentry     │      │
│  │   Logger     │  │   Metrics    │  │   Errors     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │  Health      │  │  Docker/     │                         │
│  │  Check       │  │  Railway     │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Commands

Commands are Discord slash commands that users can invoke.

**Structure:**
```typescript
export const command = {
  name: "command-name",
  description: "Command description",
  options: [...],
  execute: async (interaction) => {
    // Command logic
  }
};
```

**Key Commands:**
- `moderation.ts` - Ban, kick, mute, timeout
- `gaming.ts` - Free games, game status, deals
- `security/` - Anti-raid, anti-phishing, link checking
- `admin.ts` - Debug, hot reload, configuration

### Services

Services contain business logic and are reusable across the application.

**Key Services:**
- `ai.ts` - AI chat, translation, summarization
- `monitor.ts` - Source monitoring and alerting
- `feeds.ts` - RSS feed processing
- `rateLimiter.ts` - Rate limiting with guild-specific rules
- `health-http.ts` - Health check endpoints

### Managers

Managers coordinate complex operations across multiple services.

**Key Managers:**
- `ChannelRouter.ts` - Multi-platform routing
- `ScraperManager.ts` - Web scraping coordination
- `AlertManager.ts` - Alert grouping and escalation

### Events

Event handlers respond to Discord events.

**Key Events:**
- `messages.ts` - Message processing and moderation
- `members.ts` - Member join/leave events
- `channels.ts` - Channel updates

### Cron Jobs

Scheduled tasks that run at regular intervals.

**Key Crons:**
- `dealsCron.ts` - Game deals from Reddit (every 10 min)
- `freeGamesCron.ts` - Free games alerts (every 15 min)
- `steamNewsCron.ts` - Steam news (every 5 min)
- `twitterCron.ts` - Twitter/X monitoring (every 15 min)

### Middleware

Middleware functions that intercept and process requests.

**Key Middleware:**
- `whitelist.ts` - Access control
- `logging.ts` - Request logging
- `rateLimit.ts` - Rate limiting

## Data Flow

### Command Execution Flow

```
User Input
    ↓
Discord API
    ↓
Discord.js Command Router
    ↓
Command Handler
    ↓
[Middleware: Whitelist] → [Middleware: Rate Limit]
    ↓
Service Layer
    ↓
Data Layer (PostgreSQL/Redis)
    ↓
Response
```

### RSS Feed Processing Flow

```
Cron Trigger
    ↓
Fetch RSS Feed
    ↓
Parse Feed Items
    ↓
[Filter: 48h Time Barrier]
    ↓
[Filter: Deduplication]
    ↓
[Process: Platform Detection]
    ↓
[Process: Image Extraction]
    ↓
[Process: Channel Routing]
    ↓
Send to Discord Channels
    ↓
Store in Database
```

### Alert Processing Flow

```
Event Trigger
    ↓
Alert Detection
    ↓
[Check: Cooldown]
    ↓
[Check: Escalation Level]
    ↓
[Process: Group Similar Alerts]
    ↓
Send Notification
    ↓
[Optional: Telegram Push]
    ↓
Update Alert Status
```

## Technology Stack

### Core

- **Runtime**: Node.js 20+
- **Language**: TypeScript 6.0
- **Discord Library**: discord.js
- **ORM**: Prisma
- **Database**: PostgreSQL (Neon)
- **Cache**: Redis

### APIs & Services

- **AI**: OpenRouter API
- **Gaming Data**: RAWG.io
- **Steam**: Steam Web API
- **Error Tracking**: Sentry
- **Metrics**: Prometheus + prom-client

### Development Tools

- **Testing**: Vitest
- **Linting**: ESLint
- **Formatting**: Prettier
- **Git Hooks**: Husky + lint-staged
- **CI/CD**: GitHub Actions

### Deployment

- **Containerization**: Docker
- **Platform**: Railway
- **Health Checks**: Custom HTTP endpoints

## Design Patterns

### Singleton Pattern

Used for services that should have a single instance:
- Database connection pool
- Redis client
- Logger instance

### Factory Pattern

Used for creating command handlers and event listeners.

### Observer Pattern

Used for event handling (Discord.js events, cron triggers).

### Strategy Pattern

Used for different image extraction strategies in the image fallback system.

### Repository Pattern

Used for database operations through Prisma.

### Middleware Pattern

Used for request processing (whitelist, rate limiting, logging).

## Security

### Authentication

- Discord bot token validation
- Owner ID verification for admin commands
- Role-based access control

### Authorization

- Whitelist middleware for access control
- Guild-specific rate limiting with admin bypass
- Role-based command permissions

### Data Protection

- Environment variables for secrets
- Zod validation for user inputs
- SQL injection prevention via Prisma
- XSS prevention in Discord embeds

### Rate Limiting

- Per-user rate limiting
- Per-guild rate limiting
- Configurable cooldowns
- Admin bypass support

## Scalability

### Horizontal Scaling

- Stateless design for command handlers
- Shared Redis cache for rate limiting
- Shared PostgreSQL database
- Health checks for load balancers

### Vertical Scaling

- Connection pooling (Prisma)
- Efficient memory usage
- Async operations
- Cleanup routines

### Performance Optimizations

- Redis caching for API responses
- Image extraction with fallback system
- Batch database operations
- Lazy loading of resources

### Monitoring

- Health check endpoints
- Prometheus metrics
- Winston JSON logging
- Sentry error tracking

## Database Schema

### Key Models

- `Source` - Monitored sources (Twitter, YouTube, etc.)
- `Alert` - Security alerts with escalation
- `GuildConfig` - Per-guild configurations
- `Notification` - Feed notifications with deduplication
- `User` - User tracking and reputation

### Indexes

- Optimized for common query patterns
- Composite indexes for multi-column queries
- Unique constraints for deduplication

## Error Handling

### Strategy

- Try-catch blocks for async operations
- Error logging with context
- Graceful degradation
- Circuit breakers for external APIs

### Error Types

- `DiscordError` - Discord API errors
- `DatabaseError` - Database operation errors
- `APIError` - External API errors
- `ValidationError` - Input validation errors

## Future Enhancements

### Planned Features

- AI memory and reputation system
- Multi-modal moderation (image, video)
- Audio management runtime
- Price forecasts and de-duplication

### Architecture Improvements

- Event-driven architecture with message queues
- Microservices decomposition
- GraphQL API for external integrations
- Real-time notifications via WebSocket
