#!/usr/bin/env bash
set -euo pipefail

# DB Backup script — pg_dump with optional S3 upload
# Usage: ./scripts/db-backup.sh
# Env: DATABASE_URL, S3_BUCKET (optional), ENCRYPTION_KEY (optional)

BACKUP_DIR="${BACKUP_DIR:-/tmp/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/db_backup_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "📦 Starting database backup..."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ DATABASE_URL not set"
  exit 1
fi

# pg_dump with compression
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
echo "✅ Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Optional: encrypt with GPG
if [ -n "${ENCRYPTION_KEY:-}" ]; then
  echo "🔐 Encrypting backup..."
  gpg --batch --yes --passphrase "$ENCRYPTION_KEY" \
    --symmetric --cipher-algo AES256 "$BACKUP_FILE"
  rm "$BACKUP_FILE"
  BACKUP_FILE="${BACKUP_FILE}.gpg"
  echo "✅ Encrypted: $BACKUP_FILE"
fi

# Optional: upload to S3
if [ -n "${S3_BUCKET:-}" ]; then
  echo "☁️  Uploading to S3: s3://${S3_BUCKET}/"
  aws s3 cp "$BACKUP_FILE" "s3://${S3_BUCKET}/backups/$(basename "$BACKUP_FILE")" \
    --storage-class STANDARD_IA
  echo "✅ Uploaded to S3"
fi

# Cleanup: keep only last 7 days of backups locally
find "$BACKUP_DIR" -name "db_backup_*.sql.gz*" -mtime +7 -delete 2>/dev/null || true

echo "✅ Backup complete: $BACKUP_FILE"
