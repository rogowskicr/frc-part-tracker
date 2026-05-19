-- Per-line ordered tracking on BOM items (mirrors the existing cots_received column)
alter table public.bom_items
  add column if not exists cots_ordered boolean not null default false;
