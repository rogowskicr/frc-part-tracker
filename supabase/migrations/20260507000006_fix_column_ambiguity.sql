-- Fix "column reference user_id is ambiguous" in get_team_members.
-- The RETURNS TABLE column named user_id conflicts with tm.user_id in the body.
-- Resolved by wrapping the inner SELECT in a subquery with unambiguous aliases.

create or replace function public.get_team_members(p_team_id uuid, p_caller_id uuid)
returns table(user_id uuid, user_name text, role text, joined_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.team_memberships tm2
    where tm2.user_id = p_caller_id and tm2.team_id = p_team_id
  ) then
    raise exception 'Not a member of this team';
  end if;

  return query
  select sub.uid, sub.uname, sub.urole, sub.ujoined
  from (
    select
      tm.user_id  as uid,
      up.name     as uname,
      tm.role     as urole,
      tm.joined_at as ujoined,
      case tm.role when 'admin' then 0 when 'engineer' then 1 else 2 end as sort_key
    from public.team_memberships tm
    join public.user_profiles up on up.id = tm.user_id
    where tm.team_id = p_team_id
  ) sub
  order by sub.sort_key, sub.ujoined;
end;
$$;

grant execute on function public.get_team_members(uuid, uuid) to authenticated;
