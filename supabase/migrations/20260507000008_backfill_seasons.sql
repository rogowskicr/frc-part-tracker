-- Backfill team_seasons from teams.year for any teams that already have a year set.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
insert into public.team_seasons (team_id, year)
select id, year
from public.teams
where year is not null
on conflict (team_id, year) do nothing;

-- Force PostgREST to reload its schema cache so the new RPCs are visible.
notify pgrst, 'reload schema';
