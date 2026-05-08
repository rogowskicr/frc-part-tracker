-- ─── TEAM MEMBERSHIPS TABLE ───────────────────────────────────────────────────
-- Tracks every (user, team) pair. user_profiles.team_id remains the *active* team
-- so all existing RLS helpers (my_team_id, my_role) continue to work unchanged.
create table if not exists public.team_memberships (
  user_id   uuid not null references public.user_profiles(id) on delete cascade,
  team_id   uuid not null references public.teams(id) on delete cascade,
  role      text not null default 'engineer' check (role in ('admin', 'engineer', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

alter table public.team_memberships enable row level security;

-- Users can read their own membership rows (all teams they belong to)
create policy "own_memberships_read" on public.team_memberships
  for select using (user_id = auth.uid());

-- Team members can see all members of their active team
create policy "team_members_list" on public.team_memberships
  for select using (team_id = public.my_team_id());

-- ─── BACKFILL FROM user_profiles ──────────────────────────────────────────────
insert into public.team_memberships (user_id, team_id, role)
select id, team_id, role
from public.user_profiles
where team_id is not null
on conflict do nothing;

-- ─── EXPAND teams SELECT POLICY ───────────────────────────────────────────────
-- Previously users could only read their single active team.
-- Now they need to read any team they are a member of (for multi-team support).
drop policy if exists "team_members_read" on public.teams;

create policy "team_members_read" on public.teams
  for select using (
    id = public.my_team_id()
    or exists (
      select 1 from public.team_memberships
      where user_id = auth.uid() and team_id = id
    )
  );

-- ─── UPDATE complete_signup ────────────────────────────────────────────────────
create or replace function public.complete_signup(
  p_team_name text,
  p_team_year int,
  p_user_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id  uuid;
  v_user_id  uuid;
  v_code     text;
  v_attempts int := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  loop
    v_code := public.generate_join_code();
    exit when not exists (select 1 from public.teams where join_code = v_code);
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then raise exception 'Could not generate unique join code'; end if;
  end loop;

  insert into public.teams (name, year, join_code)
  values (p_team_name, p_team_year, v_code)
  returning id into v_team_id;

  update public.user_profiles
  set team_id = v_team_id, role = 'admin', name = p_user_name
  where id = v_user_id;

  insert into public.team_memberships (user_id, team_id, role)
  values (v_user_id, v_team_id, 'admin')
  on conflict (user_id, team_id) do update set role = 'admin';

  insert into public.manufacturing_processes (team_id, name) values
    (v_team_id, '3D Printing'), (v_team_id, 'Laser Cut'), (v_team_id, 'CNC Mill'),
    (v_team_id, 'CNC Lathe'), (v_team_id, 'Hand Fabrication'), (v_team_id, 'Welding'),
    (v_team_id, 'Sheet Metal');

  return v_team_id;
end;
$$;

grant execute on function public.complete_signup(text, int, text) to authenticated;

-- ─── UPDATE join_team (signup flow — joins as first team) ──────────────────────
create or replace function public.join_team(
  p_team_name text,
  p_join_code text,
  p_user_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select id into v_team_id
  from public.teams
  where lower(name) = lower(trim(p_team_name))
    and join_code    = upper(trim(p_join_code));

  if v_team_id is null then
    raise exception 'Team not found or incorrect join code';
  end if;

  update public.user_profiles
  set team_id = v_team_id, role = 'engineer', name = p_user_name
  where id = v_user_id;

  insert into public.team_memberships (user_id, team_id, role)
  values (v_user_id, v_team_id, 'engineer')
  on conflict (user_id, team_id) do nothing;

  return v_team_id;
end;
$$;

grant execute on function public.join_team(text, text, text) to authenticated;

-- ─── add_team_membership ───────────────────────────────────────────────────────
-- Called by an already-authenticated user to join an additional team.
-- Does NOT change their active team — they stay viewing the current one.
create or replace function public.add_team_membership(
  p_team_name text,
  p_join_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select id into v_team_id
  from public.teams
  where lower(name) = lower(trim(p_team_name))
    and join_code    = upper(trim(p_join_code));

  if v_team_id is null then
    raise exception 'Team not found or incorrect join code';
  end if;

  insert into public.team_memberships (user_id, team_id, role)
  values (v_user_id, v_team_id, 'engineer')
  on conflict (user_id, team_id) do nothing;

  -- If the user has no active team yet, set this one as active
  update public.user_profiles
  set team_id = v_team_id, role = 'engineer'
  where id = v_user_id and team_id is null;

  return v_team_id;
end;
$$;

grant execute on function public.add_team_membership(text, text) to authenticated;

-- ─── switch_active_team ────────────────────────────────────────────────────────
-- Changes which team the user is currently viewing.
-- Updates user_profiles.team_id and role to match that team's membership role.
create or replace function public.switch_active_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role    text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select role into v_role
  from public.team_memberships
  where user_id = v_user_id and team_id = p_team_id;

  if v_role is null then
    raise exception 'You are not a member of this team';
  end if;

  update public.user_profiles
  set team_id = p_team_id, role = v_role
  where id = v_user_id;
end;
$$;

grant execute on function public.switch_active_team(uuid) to authenticated;

-- ─── leave_team ────────────────────────────────────────────────────────────────
-- Removes the user from a team. If leaving the active team, automatically
-- switches to the most recently joined remaining team (or clears team_id).
create or replace function public.leave_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid;
  v_next_id   uuid;
  v_next_role text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  -- Remove membership
  delete from public.team_memberships
  where user_id = v_user_id and team_id = p_team_id;

  -- If this was the active team, pick another or clear
  if exists (
    select 1 from public.user_profiles
    where id = v_user_id and team_id = p_team_id
  ) then
    select tm.team_id, tm.role
    into v_next_id, v_next_role
    from public.team_memberships tm
    where tm.user_id = v_user_id
    order by tm.joined_at desc
    limit 1;

    update public.user_profiles
    set team_id = v_next_id,
        role    = coalesce(v_next_role, 'engineer')
    where id = v_user_id;
  end if;
end;
$$;

grant execute on function public.leave_team(uuid) to authenticated;
