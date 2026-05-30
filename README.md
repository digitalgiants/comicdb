# Comic Vault

A responsive, containerized comic book vault with per-user inventories, local or Google login, admin user management, metadata search, editable price data, and PostgreSQL persistence.

## Stack

- Frontend: Vite, React 19, TypeScript, lucide-react
- Backend: Node.js 24 LTS, Fastify, Prisma, PostgreSQL 18
- Containers: podman-compose with separate frontend, backend, and database services

## Quick Start

1. Copy `.env.example` to `.env` and change the secrets.
2. Start the app:

```sh
podman-compose up --build
```

3. Open `http://localhost:8083`.

The first registered local account is automatically made an admin. Later users default to the `USER` role.

## Caddy

For a hosted setup, point Caddy at the frontend container and keep the backend reachable by the browser:

```caddyfile
vault.example.com {
  reverse_proxy comicvault-frontend:80
}

api.vault.example.com {
  reverse_proxy comicvault-backend:8084
}
```

Set `FRONTEND_ORIGIN=https://vault.example.com` and `PUBLIC_API_BASE_URL=https://api.vault.example.com` before building the frontend container.

## External APIs

Comic Vine is used for comic metadata and cover images when `COMICVINE_API_KEY` is set. eBay Browse API is used for automated current value estimates when `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` are set. Without keys, the app still works with manual entry and editable values.

## Backups

Create a database backup:

```sh
./scripts/backup-db.sh
```

Restore a backup:

```sh
./scripts/restore-db.sh ./backups/comicvault-YYYYMMDD-HHMMSS.sql
```
