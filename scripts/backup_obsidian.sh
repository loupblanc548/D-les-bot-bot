#!/bin/bash
# backup_obsidian.sh — Backup quotidien du vault Obsidian (Q&A self-learner)
# Cron: 0 3 * * * /opt/backups/backup_obsidian.sh
BACKUP_DIR="/opt/backups"
VAULT_DIR="/opt/discord-bot/data/obsidian-vault"
DATE=$(date +%Y%m%d)
MAX_DAYS=7

mkdir -p "$BACKUP_DIR"

tar czf "$BACKUP_DIR/obsidian-$DATE.tar.gz" -C "$(dirname "$VAULT_DIR")" "$(basename "$VAULT_DIR")" 2>/dev/null

find "$BACKUP_DIR" -name "obsidian-*.tar.gz" -mtime +$MAX_DAYS -delete
