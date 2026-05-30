#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 backups/comicvault-YYYYMMDD-HHMMSS.sql"
  exit 1
fi

podman exec -i comicvault-db psql -U "${POSTGRES_USER:-comicvault}" -d "${POSTGRES_DB:-comicvault}" < "$1"
echo "Restore completed from $1"
