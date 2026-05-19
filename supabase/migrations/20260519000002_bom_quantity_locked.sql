-- Allows a BOM item's quantity to be locked so Onshape re-imports do not overwrite it
alter table public.bom_items
  add column if not exists quantity_locked boolean not null default false;
