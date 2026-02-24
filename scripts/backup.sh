#!/bin/bash
BACKUP_DIR="/home/runner/workspace/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

mkdir -p "$BACKUP_DIR"

echo "=== Elevizion Backup - $TIMESTAMP ==="
echo ""

echo "[1/3] Database backup..."
DB_FILE="$BACKUP_DIR/database_${TIMESTAMP}.sql"
pg_dump "$DATABASE_URL" --no-owner --no-privileges --if-exists --clean > "$DB_FILE" 2>&1
if [ $? -eq 0 ]; then
  SIZE=$(du -h "$DB_FILE" | cut -f1)
  echo "  OK: $DB_FILE ($SIZE)"
else
  echo "  FOUT: Database dump mislukt"
  cat "$DB_FILE"
fi

echo ""
echo "[2/3] Omgevingsvariabelen (alleen namen, geen waarden)..."
ENV_FILE="$BACKUP_DIR/env_keys_${TIMESTAMP}.txt"
cat > "$ENV_FILE" << 'HEADER'
# Elevizion - Omgevingsvariabelen referentie
# Dit bestand bevat ALLEEN de namen van benodigde variabelen.
# Vul de waarden zelf in na het herstellen.
HEADER

env | grep -vE '^(HOME|USER|SHELL|PATH|PWD|SHLVL|_|TERM|LANG|LC_|HOSTNAME|LOGNAME|MAIL|OLDPWD|SSH_|XDG_|NIX_|IN_NIX|npm_|NODE_|REPL_|REPLIT_|NIXPKGS)' \
  | cut -d= -f1 | sort >> "$ENV_FILE"
echo "  OK: $ENV_FILE"

echo ""
echo "[3/3] Oude backups opruimen (max 3 bewaren)..."
cd "$BACKUP_DIR"
ls -t database_*.sql 2>/dev/null | tail -n +4 | xargs -r rm -f
ls -t env_keys_*.txt 2>/dev/null | tail -n +4 | xargs -r rm -f
REMAINING=$(ls -1 *.sql 2>/dev/null | wc -l)
echo "  $REMAINING database backup(s) bewaard"

echo ""
echo "=== Backup compleet ==="
echo "Locatie: $BACKUP_DIR"
echo ""
echo "Je kunt nu 'Download as ZIP' gebruiken vanuit het menu."
echo "Alle bestanden inclusief database backup zitten in de ZIP."
