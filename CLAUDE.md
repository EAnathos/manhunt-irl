# ManHunt IRL

## Commands

```bash
npm run dev          # Start backend + frontend in dev mode
npm run build        # Build all workspaces
npm run lint         # Lint all workspaces
npm run typecheck    # Type-check all workspaces
npm run test         # Run tests in all workspaces
```

Individual workspaces:
```bash
npm run dev -w apps/backend       # Backend only (tsx watch)
npm run dev -w apps/frontend      # Frontend only (vite dev)
npm run test -w apps/backend      # Backend tests (vitest)
```

## Architecture

- **Monorepo** with npm workspaces: `packages/types`, `apps/backend`, `apps/frontend`
- **Backend**: Fastify + TypeScript — HTTP routes + WebSocket (via `@fastify/websocket`)
- **Frontend**: SvelteKit PWA — real-time map, lobby, elimination flows
- **Shared types**: `@manhunt/types` — all TypeScript interfaces shared between front and back
- **State**: In-memory `Map<string, Game>` — no database, no disk persistence
- **Sessions**: Anonymous opaque `session_id` stored in `localStorage` — no JWT, no auth
- **Real-time**: WebSockets for position broadcast and game events
- **Reverse proxy**: Nginx (HTTPS/WSS → localhost HTTP/WS)

## Key design decisions

- **No database**: Game data is ephemeral (max duration of a single game). RAM-only state in `Map` is simpler, faster, and eliminates external dependencies. State is purged 5 min after game ends.
- **No authentication**: Players pick a pseudo, get an opaque session ID. Simplicity over security — this is a friend-group game, not a public competitive platform.
- **SvelteKit**: Lightweight bundle, fast cold load on mobile (target: 4G networks), native reactivity fits real-time map updates.
- **Prey positions are server-controlled**: Prey GPS is NEVER routed to other Prey. During the grace period, Prey positions are blocked from reaching Hunters. This is enforced server-side, not client-side.
- **Configurable prey ping interval**: Default 2 min, min 3s, max 20 min. Hunters emit continuously.

## Conventions

- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- Branches: `main` (prod), `dev` (integration), `feat/<slug>` (features)
- No direct commits to `main`
- TypeScript strict mode everywhere
- French game terms in types (CHASSEUR/PROIE), English in code identifiers
