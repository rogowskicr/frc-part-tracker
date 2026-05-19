-- Stores custom vendor names entered by the team so they persist across parts
create table if not exists public.team_vendors (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  name       text not null,
  type       text not null check (type in ('cots', 'outsourced', 'both')),
  created_at timestamptz not null default now(),
  unique (team_id, name, type)
);

create index if not exists team_vendors_team_idx on public.team_vendors(team_id);

alter table public.team_vendors enable row level security;

create policy "team_vendors_read" on public.team_vendors
  for select using (team_id = public.my_team_id());

create policy "team_vendors_write" on public.team_vendors
  for all using (team_id = public.my_team_id() and public.my_role() in ('admin', 'engineer'));
