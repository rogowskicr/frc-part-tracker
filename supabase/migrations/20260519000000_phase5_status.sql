-- ─── PHASE 4 (backfill if not applied via SQL editor) ────────────────────────

-- COTS order status tracking per vendor group
create table if not exists public.cots_orders (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  project_code text not null,
  vendor       text not null,
  status       text not null default 'pending' check (status in ('pending', 'ordered', 'received')),
  updated_at   timestamptz not null default now(),
  unique (team_id, project_code, vendor)
);

create index if not exists cots_orders_team_project_idx on public.cots_orders(team_id, project_code);

alter table public.cots_orders enable row level security;

create policy "cots_orders_team_read" on public.cots_orders
  for select using (team_id = public.my_team_id());

create policy "cots_orders_team_write" on public.cots_orders
  for all using (team_id = public.my_team_id() and public.my_role() in ('admin', 'engineer'));

-- Per-line received tracking on BOM items
alter table public.bom_items
  add column if not exists cots_received boolean not null default false;

-- ─── PHASE 5: MANUFACTURING STATUS EXPANSION ──────────────────────────────────

-- Rename 'complete' → 'manufacturing_complete'.
-- Existing rows automatically reflect the renamed label with no data migration.
do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'part_status' and e.enumlabel = 'complete'
  ) then
    alter type public.part_status rename value 'complete' to 'manufacturing_complete';
  end if;
end $$;

-- Add powder-coat and final assembly statuses
alter type public.part_status add value if not exists 'ready_for_powder_coating' after 'manufacturing_complete';
alter type public.part_status add value if not exists 'powder_coating_complete' after 'ready_for_powder_coating';
alter type public.part_status add value if not exists 'robot_ready' after 'powder_coating_complete';
