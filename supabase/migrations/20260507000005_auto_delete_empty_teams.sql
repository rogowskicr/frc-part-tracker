-- Trigger function: delete a team when its last member leaves.
-- Fires after any DELETE on team_memberships.
create or replace function public.delete_team_if_empty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.team_memberships where team_id = old.team_id
  ) then
    delete from public.teams where id = old.team_id;
  end if;
  return old;
end;
$$;

create or replace trigger trg_delete_empty_team
  after delete on public.team_memberships
  for each row execute function public.delete_team_if_empty();

-- Clean up any teams that already have 0 members
delete from public.teams
where id not in (select distinct team_id from public.team_memberships);
