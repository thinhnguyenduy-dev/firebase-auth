# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (uses pnpm workspaces)
pnpm install

# Run both client and server in development
pnpm dev

# Run individual services
pnpm dev:frontend  # Run only frontend
pnpm dev:backend   # Run only backend

# Build all packages
pnpm build

# Run individual packages
pnpm --filter @firebase-auth-monorepo/client dev
pnpm --filter @firebase-auth-monorepo/server dev

# Lint (client only)
pnpm --filter @firebase-auth-monorepo/client lint

# Prisma commands (run from backend folder)
npx prisma generate    # Generate Prisma client
npx prisma db push     # Push schema to database
npx prisma migrate dev # Create and apply migrations
```

## Architecture

This is a pnpm monorepo with two packages:

### frontend (Next.js 16)
- **Auth flow**: Firebase Client SDK handles authentication (email/password + OAuth providers)
- `src/lib/firebase.ts` - Firebase app initialization and auth providers (Google, Facebook, Microsoft, Apple)
- `src/context/AuthContext.tsx` - React context providing `user`, `loading`, and `signOut`; auto-syncs users to backend on auth state change
- `src/lib/api.ts` - Backend API calls with Firebase ID token in Authorization header
- Uses Tailwind CSS v4 with `@tailwindcss/postcss`

### backend (Express + TypeScript)
- **Auth verification**: Firebase Admin SDK verifies ID tokens from client
- `src/config/firebase.ts` - Firebase Admin initialization from env vars
- `src/middleware/auth.ts` - `verifyToken` middleware extracts and validates Bearer token, attaches `user` to request
- Uses Prisma with PostgreSQL; User model links `firebaseUid` to local user records
- `POST /api/users/sync` - Upserts user on login (called automatically by client)
- `GET /api/protected` - Example protected route

### Authentication Pattern
1. Client authenticates with Firebase (popup or email/password)
2. Client gets ID token via `user.getIdToken()`
3. Client sends token as `Authorization: Bearer <token>` header
4. Server middleware verifies token with Firebase Admin SDK
5. On first auth, client auto-syncs user to backend database

### Account Linking
When a user signs in with a provider (e.g., Facebook) but an account already exists with the same email from a different provider (e.g., Google), the accounts are automatically linked via the backend.

- `src/services/providerVerifier.ts` - Verifies OAuth tokens with provider APIs
- `src/routes/auth.ts` - `POST /api/auth/link-provider` endpoint uses Firebase Admin SDK's `providerToLink`
- See [docs/account-linking.md](docs/account-linking.md) for detailed documentation
