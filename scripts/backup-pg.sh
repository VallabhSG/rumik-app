#!/bin/bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/data/backups/pg}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/ota_${TIMESTAMP}.dump"

mkdir -p "$BACKUP_DIR"

echo "[backup] Starting pg_dump at $(date)"
pg_dump "$DATABASE_URL" --format=custom --file="$BACKUP_FILE"
echo "[backup] Saved to $BACKUP_FILE"

find "$BACKUP_DIR" -name "*.dump" -mtime "+${RETENTION_DAYS}" -delete
echo "[backup] Pruned backups older than ${RETENTION_DAYS} days"
echo "[backup] Done"
