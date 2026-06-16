#!/usr/bin/env bash
# PM2 wrapper - lance le bot avec tsx
cd "$(dirname "$0")"
exec npx tsx src/index.ts
