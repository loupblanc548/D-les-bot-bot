# Architecture Diagram

## System Architecture Overview

```mermaid
graph TB
    subgraph "External Services"
        DISCORD[Discord API]
        OPENROUTER[OpenRouter AI]
        RAWG[RAWG.io API]
        STEAM[Steam API]
        TWITTER[Twitter/X API]
        YOUTUBE[YouTube API]
    end

    subgraph "Discord Surveillance Bot"
        subgraph "Discord.js Layer"
            CLIENT[Discord.js Client]
            EVENTS[Event Handlers]
            COMMANDS[Command Router]
            RATELIMIT[Rate Limiter]
        end

        subgraph "Application Layer"
            subgraph "Commands"
                MOD[Moderation]
                GAMING[Gaming]
                SECURITY[Security]
                ADMIN[Admin]
            end

            subgraph "Services"
                AI[AI Service]
                MONITOR[Monitor Service]
                FEEDS[Feeds Service]
                HEALTH[Health Service]
                METRICS[Metrics Service]
            end

            subgraph "Managers"
                ROUTER[Channel Router]
                SCRAPER[Scraper Manager]
                ALERT[Alert Manager]
            end

            subgraph "Cron Jobs"
                DEALS[Deals Cron]
                FREE[Free Games Cron]
                STEAM_NEWS[Steam News Cron]
                TWITTER_CRON[Twitter Cron]
            end

            subgraph "Middleware"
                WHITELIST[Whitelist]
                LOGGING[Logging]
            end
        end

        subgraph "Data Layer"
            POSTGRES[(PostgreSQL)]
            REDIS[(Redis Cache)]
        end

        subgraph "Monitoring"
            WINSTON[Winston Logger]
            PROMETHEUS[Prometheus Metrics]
            SENTRY[Sentry Error Tracking]
            HEALTHCHECK[Health Check Endpoints]
        end
    end

    DISCORD --> CLIENT
    CLIENT --> EVENTS
    CLIENT --> COMMANDS
    COMMANDS --> RATELIMIT
    RATELIMIT --> WHITELIST
    
    COMMANDS --> MOD
    COMMANDS --> GAMING
    COMMANDS --> SECURITY
    COMMANDS --> ADMIN

    EVENTS --> MONITOR
    EVENTS --> ALERT

    MOD --> POSTGRES
    SECURITY --> POSTGRES
    GAMING --> ROUTER

    AI --> OPENROUTER
    MONITOR --> POSTGRES
    FEEDS --> ROUTER
    FEEDS --> SCRAPER

    ROUTER --> CLIENT
    SCRAPER --> RAWG
    SCRAPER --> STEAM

    DEALS --> FEEDS
    FREE --> FEEDS
    STEAM_NEWS --> FEEDS
    TWITTER_CRON --> FEEDS

    FEEDS --> TWITTER
    FEEDS --> YOUTUBE

    POSTGRES --> HEALTH
    REDIS --> RATELIMIT
    REDIS --> FEEDS

    HEALTH --> HEALTHCHECK
    METRICS --> PROMETHEUS
    WINSTON --> SENTRY

    style DISCORD fill:#5865F2
    style CLIENT fill:#5865F2
    style POSTGRES fill:#336791
    style REDIS fill:#DC382D
    style OPENROUTER fill:#10B981
    style RAWG fill:#F59E0B
    style STEAM fill:#1B2838
```

## Data Flow: RSS Feed Processing

```mermaid
sequenceDiagram
    participant Cron as Cron Job
    participant Feed as Feed Service
    participant Parser as RSS Parser
    participant Filter as Filter Layer
    participant Router as Channel Router
    participant Discord as Discord API
    participant DB as PostgreSQL

    Cron->>Feed: Trigger (every 10-15 min)
    Feed->>Parser: Fetch RSS Feed
    Parser-->>Feed: Parsed Items
    Feed->>Filter: Apply 48h Barrier
    Filter-->>Feed: Filtered Items
    Feed->>Filter: Deduplication Check
    Filter->>DB: Check Existing Posts
    DB-->>Filter: Post Status
    Filter-->>Feed: Unique Items
    Feed->>Router: Process Items
    Router->>Router: Detect Platforms
    Router->>Router: Extract Images
    Router->>Discord: Send to Channels
    Feed->>DB: Store Notifications
```

## Data Flow: Command Execution

```mermaid
sequenceDiagram
    participant User as Discord User
    participant API as Discord API
    participant Router as Command Router
    participant Whitelist as Whitelist Middleware
    participant RateLimit as Rate Limiter
    participant Command as Command Handler
    participant Service as Service Layer
    participant DB as PostgreSQL

    User->>API: Slash Command
    API->>Router: Interaction Event
    Router->>Whitelist: Check Access
    Whitelist-->>Router: Access Status
    Router->>RateLimit: Check Rate Limit
    RateLimit-->>Router: Rate Limit Status
    Router->>Command: Execute Command
    Command->>Service: Business Logic
    Service->>DB: Query/Update
    DB-->>Service: Data
    Service-->>Command: Result
    Command-->>Router: Response
    Router->>API: Send Response
    API-->>User: Embed/Message
```

## Component Relationships

```mermaid
graph LR
    subgraph "Core Components"
        CONFIG[config.ts]
        LOGGER[logger.ts]
        PRISMA[prisma.ts]
    end

    subgraph "Commands"
        MAIN[main.ts]
        MODERATION[moderation.ts]
        GAMING[gaming.ts]
        SECURITY[security/]
    end

    subgraph "Services"
        AI[ai.ts]
        MONITOR[monitor.ts]
        FEEDS[feeds.ts]
        RATELIMIT[rateLimiter.ts]
    end

    subgraph "Managers"
        CHANNEL[ChannelRouter.ts]
        SCRAPER[ScraperManager.ts]
    end

    CONFIG --> MAIN
    CONFIG --> MODERATION
    CONFIG --> GAMING
    CONFIG --> SECURITY
    CONFIG --> AI
    CONFIG --> MONITOR
    CONFIG --> FEEDS

    LOGGER --> MAIN
    LOGGER --> MODERATION
    LOGGER --> GAMING
    LOGGER --> SECURITY
    LOGGER --> AI
    LOGGER --> MONITOR
    LOGGER --> FEEDS

    PRISMA --> MODERATION
    PRISMA --> GAMING
    PRISMA --> MONITOR
    PRISMA --> FEEDS

    RATELIMIT --> MAIN
    RATELIMIT --> MODERATION
    RATELIMIT --> GAMING

    CHANNEL --> GAMING
    CHANNEL --> FEEDS
    SCRAPER --> FEEDS
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Production Environment"
        subgraph "Railway"
            APP[Bot Application]
            POSTGRES_RAIL[(PostgreSQL)]
            REDIS_RAIL[(Redis)]
        end

        subgraph "External"
            DISCORD_EXT[Discord API]
            SENTRY_EXT[Sentry]
            PROMETHEUS_EXT[Prometheus]
        end
    end

    APP --> POSTGRES_RAIL
    APP --> REDIS_RAIL
    APP --> DISCORD_EXT
    APP --> SENTRY_EXT
    APP --> PROMETHEUS_EXT

    style APP fill:#5865F2
    style POSTGRES_RAIL fill:#336791
    style REDIS_RAIL fill:#DC382D
    style DISCORD_EXT fill:#5865F2
    style SENTRY_EXT fill:#F97316
    style PROMETHEUS_EXT fill:#E53935
```

## Security Layers

```mermaid
graph TB
    subgraph "Security Architecture"
        AUTH[Authentication]
        AUTHZ[Authorization]
        VALIDATE[Input Validation]
        SANITIZE[Output Sanitization]
        RATE[Rate Limiting]
        WHITELIST_SEC[Whitelist]
        ENCRYPT[Encryption]
    end

    AUTH --> AUTHZ
    AUTHZ --> WHITELIST_SEC
    WHITELIST_SEC --> RATE
    RATE --> VALIDATE
    VALIDATE --> SANITIZE
    SANITIZE --> ENCRYPT

    style AUTH fill:#10B981
    style AUTHZ fill:#10B981
    style VALIDATE fill:#F59E0B
    style SANITIZE fill:#F59E0B
    style RATE fill:#EF4444
    style WHITELIST_SEC fill:#EF4444
    style ENCRYPT fill:#8B5CF6
```

## Monitoring Stack

```mermaid
graph LR
    subgraph "Application"
        APP[Bot Application]
    end

    subgraph "Logging"
        WINSTON[Winston]
        LOGS[Log Files]
    end

    subgraph "Metrics"
        PROM_CLIENT[prom-client]
        METRICS_ENDPOINT[/metrics]
    end

    subgraph "Health Checks"
        HEALTH_SERVER[Health Server]
        HEALTH_ENDPOINT[/health]
    end

    subgraph "Error Tracking"
        SENTRY[Sentry]
    end

    APP --> WINSTON
    WINSTON --> LOGS
    WINSTON --> SENTRY

    APP --> PROM_CLIENT
    PROM_CLIENT --> METRICS_ENDPOINT

    APP --> HEALTH_SERVER
    HEALTH_SERVER --> HEALTH_ENDPOINT

    style APP fill:#5865F2
    style WINSTON fill:#6366F1
    style PROM_CLIENT fill:#E53935
    style HEALTH_SERVER fill:#10B981
    style SENTRY fill:#F97316
```
