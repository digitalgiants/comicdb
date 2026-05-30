#!/usr/bin/env sh
set -eu

mkdir -p backups
STAMP="$(date +%Y%m%d-%H%M%S)"
podman exec comicvault-db pg_dump -U "${POSTGRES_USER:-comicvault}" "${POSTGRES_DB:-comicvault}" > "backups/comicvault-${STAMP}.sql"
echo "Backup written to backups/comicvault-${STAMP}.sql"
