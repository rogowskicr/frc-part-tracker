-- FRC Part Tracker - Initial Schema
-- Run this in your Supabase SQL editor or via Supabase CLI

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── TEAMS ────────────────────────────────────────────────────────────────────
create table if not exists public.teams (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  year        integer not null default extract(year from now())::integer,
  settings    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- ─── USER PROFILES ────────────────────────────────────────────────────────────
-- Extends auth.users with role and team membership
create table if not exists public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text not null,
  role        text not null default 'engineer' check (role in ('admin', 'engineer', 'viewer')),
  team_id     uuid references public.teams(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ─── ASSEMBLIES ───────────────────────────────────────────────────────────────
create table if not exists public.assemblies (
  id                  uuid primary key default uuid_generate_v4(),
  assembly_number     text not null,            -- e.g. 26_A_100
  name                text not null,
  description         text,
  cad_link            text,
  onshape_doc_id      text,
  parent_assembly_id  uuid references public.assemblies(id) on delete set null,
  team_id             uuid not null references public.teams(id) on delete cascade,
  created_by          uuid references public.user_profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (team_id, assembly_number)
);

-- ─── PARTS ────────────────────────────────────────────────────────────────────
create type if not exists public.part_type as enum ('manufactured', 'off_shelf');
create type if not exists public.part_status as enum (
  'design',
  'ready_for_manufacturing',
  'in_progress',
  'complete',
  'on_hold'
);

create table if not exists public.parts (
  id              uuid primary key default uuid_generate_v4(),
  part_number     text,                          -- e.g. 26_P_101 (null for COTS)
  name            text not null,
  description     text,
  assembly_id     uuid not null references public.assemblies(id) on delete cascade,
  cad_link        text,
  status          public.part_status not null default 'design',
  assigned_to     uuid references public.user_profiles(id) on delete set null,
  type            public.part_type not null default 'manufactured',
  naming_flagged  boolean not null default false,
  team_id         uuid not null references public.teams(id) on delete cascade,
  created_by      uuid references public.user_profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── BOM ITEMS ────────────────────────────────────────────────────────────────
create table if not exists public.bom_items (
  id                          uuid primary key default uuid_generate_v4(),
  assembly_id                 uuid not null references public.assemblies(id) on delete cascade,
  part_id                     uuid not null references public.parts(id) on delete cascade,
  onshape_quantity            integer not null default 1,
  -- COTS-specific fields
  cots_supplier_part_number   text,
  cots_quantity               integer,
  cots_quantity_spare         integer not null default 0,
  cots_purchase_link          text,
  cots_vendor                 text,
  created_at                  timestamptz not null default now()
);

-- ─── MANUFACTURING PROCESSES ──────────────────────────────────────────────────
create table if not exists public.manufacturing_processes (
  id          uuid primary key default uuid_generate_v4(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (team_id, name)
);

-- Default processes (inserted per team on creation)
-- 3D Print, Laser Cut, CNC Mill, CNC Lathe, Hand Fabrication, Welding, Outsourced

-- ─── PART MANUFACTURING ───────────────────────────────────────────────────────
create type if not exists public.manufacturing_status as enum (
  'not_started',
  'in_progress',
  'complete'
);

create table if not exists public.part_manufacturing (
  id                  uuid primary key default uuid_generate_v4(),
  part_id             uuid not null references public.parts(id) on delete cascade,
  process_id          uuid references public.manufacturing_processes(id) on delete set null,
  outsourced          boolean not null default false,
  vendor              text,
  export_file_format  text,                -- PDF, STEP, DXF, SVG, etc.
  status              public.manufacturing_status not null default 'not_started',
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ─── PART STATUS HISTORY ──────────────────────────────────────────────────────
create table if not exists public.part_status_history (
  id          uuid primary key default uuid_generate_v4(),
  part_id     uuid not null references public.parts(id) on delete cascade,
  status      public.part_status not null,
  changed_at  timestamptz not null default now(),
  changed_by  uuid references public.user_profiles(id) on delete set null,
  notes       text
);

-- ─── UPDATED_AT TRIGGERS ──────────────────────────────────────────────────────
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger assemblies_updated_at
  before update on public.assemblies
  for each row execute function public.update_updated_at();

create trigger parts_updated_at
  before update on public.parts
  for each row execute function public.update_updated_at();

create trigger part_manufacturing_updated_at
  before update on public.part_manufacturing
  for each row execute function public.update_updated_at();

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table public.teams enable row level security;
alter table public.user_profiles enable row level security;
alter table public.assemblies enable row level security;
alter table public.parts enable row level security;
alter table public.bom_items enable row level security;
alter table public.manufacturing_processes enable row level security;
alter table public.part_manufacturing enable row level security;
alter table public.part_status_history enable row level security;

-- Helper: get the team_id of the current user
create or replace function public.my_team_id()
returns uuid as $$
  select team_id from public.user_profiles where id = auth.uid()
$$ language sql security definer stable;

-- Helper: get the role of the current user
create or replace function public.my_role()
returns text as $$
  select role from public.user_profiles where id = auth.uid()
$$ language sql security definer stable;

-- Teams: members can read their own team
create policy "team_members_read" on public.teams
  for select using (id = public.my_team_id());

create policy "team_admin_update" on public.teams
  for update using (id = public.my_team_id() and public.my_role() = 'admin');

-- User profiles: users read their own team's profiles
create policy "profiles_team_read" on public.user_profiles
  for select using (team_id = public.my_team_id() or id = auth.uid());

create policy "profiles_own_update" on public.user_profiles
  for update using (id = auth.uid());

-- Assemblies: scoped to team
create policy "assemblies_team_read" on public.assemblies
  for select using (team_id = public.my_team_id());

create policy "assemblies_team_insert" on public.assemblies
  for insert with check (team_id = public.my_team_id() and public.my_role() in ('admin', 'engineer'));

create policy "assemblies_team_update" on public.assemblies
  for update using (team_id = public.my_team_id() and public.my_role() in ('admin', 'engineer'));

create policy "assemblies_team_delete" on public.assemblies
  for delete using (team_id = public.my_team_id() and public.my_role() = 'admin');

-- Parts: scoped to team
create policy "parts_team_read" on public.parts
  for select using (team_id = public.my_team_id());

create policy "parts_team_insert" on public.parts
  for insert with check (team_id = public.my_team_id() and public.my_role() in ('admin', 'engineer'));

create policy "parts_team_update" on public.parts
  for update using (team_id = public.my_team_id() and public.my_role() in ('admin', 'engineer'));

create policy "parts_team_delete" on public.parts
  for delete using (team_id = public.my_team_id() and public.my_role() = 'admin');

-- BOM Items: scoped to team via assembly
create policy "bom_team_read" on public.bom_items
  for select using (
    exists (select 1 from public.assemblies a where a.id = assembly_id and a.team_id = public.my_team_id())
  );

create policy "bom_team_write" on public.bom_items
  for all using (
    exists (select 1 from public.assemblies a where a.id = assembly_id and a.team_id = public.my_team_id())
    and public.my_role() in ('admin', 'engineer')
  );

-- Manufacturing processes: scoped to team
create policy "mfg_processes_team_read" on public.manufacturing_processes
  for select using (team_id = public.my_team_id());

create policy "mfg_processes_team_write" on public.manufacturing_processes
  for all using (team_id = public.my_team_id() and public.my_role() in ('admin', 'engineer'));

-- Part manufacturing: scoped to team
create policy "part_mfg_team_read" on public.part_manufacturing
  for select using (
    exists (select 1 from public.parts p where p.id = part_id and p.team_id = public.my_team_id())
  );

create policy "part_mfg_team_write" on public.part_manufacturing
  for all using (
    exists (select 1 from public.parts p where p.id = part_id and p.team_id = public.my_team_id())
    and public.my_role() in ('admin', 'engineer')
  );

-- Part status history: scoped to team
create policy "part_history_team_read" on public.part_status_history
  for select using (
    exists (select 1 from public.parts p where p.id = part_id and p.team_id = public.my_team_id())
  );

create policy "part_history_team_insert" on public.part_status_history
  for insert with check (
    exists (select 1 from public.parts p where p.id = part_id and p.team_id = public.my_team_id())
  );

-- ─── FUNCTION: Create user profile on signup ─────────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'engineer'
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
