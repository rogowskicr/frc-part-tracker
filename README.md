# FRC Part Tracker

A web application for FRC teams to track parts and subassemblies through the design and manufacturing process.

## Tech Stack

- **Frontend/Backend**: Next.js 16 (App Router) + TypeScript
- **Database**: PostgreSQL via Supabase
- **Auth**: Supabase Auth (email/password, RBAC)
- **Styling**: Tailwind CSS

## Getting Started (Local Development)

### 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the migration:
   ```
   supabase/migrations/001_initial_schema.sql
   ```
3. Go to **Settings → API** and copy your Project URL and anon key

### 2. Configure environment

```bash
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials
```

### 3. Run the dev server

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign up to create your team.

> **Windows / PowerShell note:** If `npm` is not recognized, use the full path:
> ```powershell
> & "C:\Program Files\nodejs\npm.cmd" install
> & "C:\Program Files\nodejs\npm.cmd" run dev
> ```
> In a standard Command Prompt (`cmd.exe`), plain `npm` works fine.

Press **Ctrl+C** in the terminal to stop the server.

## Part Numbering Convention

| Format | Example | Description |
|--------|---------|-------------|
| `YY_A_NNN` | `26_A_100` | Top-level assembly (multiples of 100) |
| `YY_A_NNN` | `26_A_101` | Sub-assembly (increments by 1) |
| `YY_P_NNN` | `26_P_101` | Part (starts at parent number + 1) |

Where `YY` is the last 2 digits of the season year.

## Phase 1 Features

- User authentication with role-based access (admin / engineer / viewer)
- Team creation and management
- Assembly CRUD with parent/sub-assembly hierarchy
- Part CRUD with manufactured vs off-the-shelf classification
- Part/Assembly number validation (YY_A/P_### format)
- Auto-suggested sequential part numbers
- BOM quantity tracking (required + spare)
- COTS fields: vendor, supplier part number, purchase link
- Part status tracking with history log
- Part assignment to team members
- Dashboard with status overview

## Roadmap

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the full plan including OnShape API integration, COTS order aggregation, manufacturing workflow, and more.
