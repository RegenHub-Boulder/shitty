# Shitty - Chore Tracker

A simple, self-hosted chore tracking app for your household, built with Bun, React, and SQLite.

## Quick Start

1. **Install Bun** (if not already installed):
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Development mode**:
   ```bash
   bun run dev
   ```
   Visit `http://localhost:3000`

4. **Production mode**:
   ```bash
   bun run build
   bun run start
   ```

## Features

- ✅ Track household chores with custom icons
- ✅ Multiple caretakers support
- ✅ Tending history with notes
- ✅ Sync across devices with sync codes
- ✅ PWA support (works offline)
- ✅ SQLite database (local file)
- ✅ Responsive design with Tailwind CSS

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Bun server with native SQLite
- **Database**: SQLite (single `shitty.db` file)
- **Build**: Bun's built-in bundler

## Project Structure

```
src/
├── server.ts          # Bun server with API routes
├── client/
│   └── main.tsx       # React frontend
├── db/
│   └── migrate.ts     # Database migrations (optional)
└── ...
```

## API Endpoints

- `GET /api/:syncId/chores` - Get all chores
- `POST /api/:syncId/chores` - Add new chore
- `PUT /api/:syncId/chores/:id` - Update chore
- `DELETE /api/:syncId/chores/:id` - Delete chore
- `GET /api/:syncId/caretakers` - Get all caretakers
- `POST /api/:syncId/caretakers` - Add caretaker
- `GET /api/:syncId/history` - Get tending history
- `POST /api/:syncId/tend` - Log a tending action

## Sync System

Each installation has a unique sync ID stored in localStorage. Share your sync code with other devices to sync the same data.

## Database

SQLite database (`shitty.db`) is created automatically. Each sync ID gets its own row in the `shitty_instances` table.

## Development vs Production

- **Dev**: Uses `bun --watch` with direct TypeScript execution
- **Prod**: Builds React app to `dist/` and serves static files

## Deployment

For self-hosting on your Mac:

1. Build the app: `bun run build`
2. Start production server: `bun run start`
3. Access via local network IP for other devices

The app works great as a kitchen tablet display or shared household dashboard!