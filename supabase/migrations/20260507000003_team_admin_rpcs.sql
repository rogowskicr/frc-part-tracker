-- ─── get_team_members ──────────────────────────────────────────────────────────
-- Returns all members of a team. Caller must be a member of that team.
-- Admins listed first, then by join date.
create or replace function public.get_team_members(p_team_id uuid)
returns table(user_id uuid, user_name text, role text, joined_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.team_memberships
    where user_id = auth.uid() and team_id = p_team_id
  ) then
    raise exception 'Not a member of this team';
  end if;

  return query
  select tm.user_id, up.name, tm.role, tm.joined_at
  from public.team_memberships tm
  join public.user_profiles up on up.id = tm.user_id
  where tm.team_id = p_team_id
  order by
    case tm.role when 'admin' then 0 when 'engineer' then 1 else 2 end,
    tm.joined_at;
end;
$$;

grant execute on function public.get_team_members(uuid) to authenticated;

-- ─── get_team_assembly_years ───────────────────────────────────────────────────
-- Returns distinct 4-digit years inferred from assembly_number prefixes (e.g. "26" → 2026).
-- Falls back to teams.year if no assemblies exist.
create or replace function public.get_team_assembly_years(p_team_id uuid)
returns table(year int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_year int;
begin
  if not exists (
    select 1 from public.team_memberships
    where user_id = auth.uid() and team_id = p_team_id
  ) then
    raise exception 'Not a member of this team';
  end if;

  return query
  select distinct
    case
      when cast(substr(a.assembly_number, 1, 2) as int) < 50
        then 2000 + cast(substr(a.assembly_number, 1, 2) as int)
      else 1900 + cast(substr(a.assembly_number, 1, 2) as int)
    end
  from public.assemblies a
  where a.team_id = p_team_id
    and a.assembly_number ~ '^\d{2}_'
  order by 1 desc;

  -- If no assemblies, return the team's own year
  if not found then
    select t.year into v_team_year from public.teams t where t.id = p_team_id;
    if v_team_year is not null then
      return query select v_team_year;
    end if;
  end if;
end;
$$;

grant execute on function public.get_team_assembly_years(uuid) to authenticated;

-- ─── update_member_role ────────────────────────────────────────────────────────
-- Admin-only: change another member's role.
-- Also updates user_profiles.role if this is the target's active team.
create or replace function public.update_member_role(
  p_team_id  uuid,
  p_user_id  uuid,
  p_new_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
begin
  if p_new_role not in ('admin', 'engineer', 'viewer') then
    raise exception 'Invalid role — must be admin, engineer, or viewer';
  end if;

  select role into v_caller_role
  from public.team_memberships
  where user_id = auth.uid() and team_id = p_team_id;

  if v_caller_role is distinct from 'admin' then
    raise exception 'Only admins can change member roles';
  end if;

  update public.team_memberships
  set role = p_new_role
  where user_id = p_user_id and team_id = p_team_id;

  -- Keep user_profiles.role in sync if this team is their active team
  update public.user_profiles
  set role = p_new_role
  where id = p_user_id and team_id = p_team_id;
end;
$$;

grant execute on function public.update_member_role(uuid, uuid, text) to authenticated;

-- ─── remove_team_member ────────────────────────────────────────────────────────
-- Admin-only: remove another user from the team.
-- Automatically switches that user's active team if needed.
create or replace function public.remove_team_member(
  p_team_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_next_team   uuid;
  v_next_role   text;
begin
  select role into v_caller_role
  from public.team_memberships
  where user_id = auth.uid() and team_id = p_team_id;

  if v_caller_role is distinct from 'admin' then
    raise exception 'Only admins can remove members';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Use "Leave" to remove yourself from a team';
  end if;

  delete from public.team_memberships
  where user_id = p_user_id and team_id = p_team_id;

  -- Auto-switch removed user's active team if they were viewing this one
  if exists (
    select 1 from public.user_profiles where id = p_user_id and team_id = p_team_id
  ) then
    select tm.team_id, tm.role into v_next_team, v_next_role
    from public.team_memberships tm
    where tm.user_id = p_user_id
    order by tm.joined_at desc
    limit 1;

    update public.user_profiles
    set team_id = v_next_team,
        role    = coalesce(v_next_role, 'engineer')
    where id = p_user_id;
  end if;
end;
$$;

grant execute on function public.remove_team_member(uuid, uuid) to authenticated;
