-- Replace auth.uid()-dependent RPCs with explicit p_caller_id parameter.
-- auth.uid() can be unreliable inside security definer functions depending
-- on how the PostgREST session is configured.

drop function if exists public.get_team_members(uuid);
drop function if exists public.get_team_assembly_years(uuid);

create or replace function public.get_team_members(p_team_id uuid, p_caller_id uuid)
returns table(user_id uuid, user_name text, role text, joined_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.team_memberships
    where user_id = p_caller_id and team_id = p_team_id
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

grant execute on function public.get_team_members(uuid, uuid) to authenticated;

create or replace function public.get_team_assembly_years(p_team_id uuid, p_caller_id uuid)
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
    where user_id = p_caller_id and team_id = p_team_id
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

  if not found then
    select t.year into v_team_year from public.teams t where t.id = p_team_id;
    if v_team_year is not null then
      return query select v_team_year;
    end if;
  end if;
end;
$$;

grant execute on function public.get_team_assembly_years(uuid, uuid) to authenticated;
