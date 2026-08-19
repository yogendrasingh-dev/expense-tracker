# Expense Tracker

A personal expense tracker backend (Node.js, TypeScript, Fastify, PostgreSQL, Prisma), built via a
spec-driven workflow with Claude Code. See `CLAUDE.md` and `docs/` for the full specification and
implementation plan.

## Prerequisites

- Node.js 22.x (see `.nvmrc`)
- Docker (for local PostgreSQL)

## Setup

```bash
nvm use
npm install
cp .env.example .env
docker compose up -d
```

## Development

```bash
npm run dev
```

## Testing

```bash
npm test           # run once
npm run test:watch # watch mode
```

## Linting & Formatting

```bash
npm run lint
npm run format
npm run typecheck
```

## Production Build

```bash
npm run build
npm start
```
