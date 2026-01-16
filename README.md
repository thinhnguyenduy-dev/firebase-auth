# Firebase Authentication Demo

A full-stack monorepo application demonstrating Firebase Authentication.

- **Frontend**: Next.js 16, Tailwind CSS, Firebase Client SDK
- **Backend**: Express, TypeScript, Prisma (PostgreSQL), Firebase Admin SDK

## Structure

```
/
  frontend/  # Next.js Frontend
  backend/   # Express Backend
```

## Prerequisites

- Node.js & npm/pnpm
- PostgreSQL Database
- Firebase Project (Email/Password Auth enabled)

## Setup

### 1. Installation

```bash
pnpm install
```

### 2. Backend Configuration (`backend`)

Create `backend/.env` based on `.env.example`:

```bash
PORT=4000
DATABASE_URL="postgresql://user:password@localhost:5432/dbname?schema=public"

# Firebase Admin SDK
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="your-email@project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

Run migrations:
```bash
cd backend
npx prisma generate
npx prisma db push
```

### 3. Frontend Configuration (`frontend`)

Create `frontend/.env.local`:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=app_id
```

## Running the App

Run both frontend and backend concurrently from the root:

```bash
pnpm dev
```

Or run them individually:

```bash
pnpm dev:frontend  # Run only frontend
pnpm dev:backend   # Run only backend
```

- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Backend**: [http://localhost:4000](http://localhost:4000)

## Documentation

- [Firebase Account Linking](./docs/FIREBASE_ACCOUNT_LINKING.md) - Detailed guide on the "Link accounts that use the same email" setting and how this app implements secure multi-provider authentication.
