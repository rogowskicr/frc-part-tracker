# ORF 4450 Part Tracker — Implementation Plan

## Problem Statement
A cloud-hosted web application for FRC teams to track parts and subassemblies through design and manufacturing, integrating with OnShape CAD for BOM management. Supports off-the-shelf and manufactured parts, manufacturing workflow tracking, and team collaboration.

## Stack
- **Frontend/Backend**: Next.js 16 (App Router) + TypeScript
- **Database**: PostgreSQL via Supabase (RLS, RPCs, Auth)
- **Hosting**: Vercel
- **External API**: OnShape REST API (HMAC-SHA256 key auth)

---

## Core Architecture (as built)

### Part/Assembly Numbering — `PP[L]_T_NNN`
- `PP` = last 2 digits of year (e.g. `26` for 2026)
- `L` = optional single letter suffix for additional projects that year (e.g. `26A`, `26B`)
- `T` = type: `A` for assembly, `P` for part
- `NNN` = 3+ digit sequential number
- Top-level assemblies: multiples of 100 (`26_A_100`, `26_A_200`)
- Sub-assemblies: +1 within the 100-block (`26_A_101`, `26_A_102`)
- Parts: derived from parent assembly base (`26_P_101`, `26_P_102`)
- Note: an earlier iteration generated 4-digit prefixes (e.g. `2601_A_100`); migration 011 corrected existing records to 2-digit format.

### Projects — `(team_id, year, suffix)`
- A **project** is a `(year, suffix)` pair. Suffix is `''` (base) or a single letter A–Z.
- Project codes: `"26"` (base season), `"26A"` (e.g. offseason robot). Stored as 2–3 char text in `user_profiles.active_project_code`.
- Teams can have multiple projects per year; each gets its own part-number namespace.
- Users set an active project to scope their view; `NULL` = see all projects across all years.
- The team's founding project is created during signup; additional projects are added by admins on the team page.

### Multi-Team
- A user can belong to multiple teams via `team_memberships (user_id, team_id, role)`.
- `user_profiles.team_id` = the user's currently active team.
- Teams have a 6-char join code (unambiguous charset: no O/0, I/1) for member onboarding.
- Teams with zero members are automatically deleted by a DB trigger.
- Switching active team clears the active project code.

### Roles — `admin | engineer | viewer`
- `admin`: full access plus team/project management, member role changes, member removal
- `engineer`: full part/assembly CRUD and status updates
- `viewer`: read-only (DB-level RLS enforced; UI guards implemented)

### Parts Page — Deduplicated View
- Parts with an OnShape identity are shown once across all assemblies (keyed by name for OnShape-imported parts)
- Quantities are summed across all assemblies; spare quantities are always a project-wide total
- Assembly badges link to each assembly the part appears in
- Status badge shows the furthest-behind status across all instances

---

## Database Schema (current — as of Phase 3)

| Table | Key columns |
|---|---|
| `teams` | id, name, join_code, settings (jsonb) |
| `user_profiles` | id, name, team_id (active), role, active_project_code |
| `team_memberships` | user_id, team_id, role, joined_at |
| `team_projects` | team_id, year, suffix (text, '' or A–Z), created_at |
| `assemblies` | id, team_id, assembly_number, name, description, cad_link, parent_assembly_id, onshape_doc_id, onshape_element_id, onshape_workspace_id, onshape_last_sync |
| `parts` | id, team_id, assembly_id, part_number, name, description, type, status, assigned_to, cad_link, naming_flagged, onshape_part_id, onshape_element_id, onshape_workspace_id, onshape_thumbnail_url |
| `bom_items` | id, assembly_id, part_id, onshape_quantity, cots_quantity, cots_quantity_spare, cots_vendor, cots_supplier_part_number, cots_purchase_link |
| `part_status_history` | id, part_id, status, changed_at, changed_by, notes |
| `manufacturing_processes` | id, team_id, name |
| `team_onshape_credentials` | team_id (pk), access_key, secret_key, updated_at |
| `onshape_bom_cache` | team_id, cache_key, bom_json, fetched_at |
| `onshape_sync_diffs` | id, team_id, assembly_id, added_parts, removed_parts, changed_parts, applied, applied_at |

### Security-definer RPCs (callable by authenticated role)
| Function | Purpose |
|---|---|
| `complete_signup(name, username)` | Creates team + founding project + default mfg processes |
| `join_team(join_code, username)` | Joins existing team by code (signup flow) |
| `add_team_membership(join_code)` | Joins additional team (authenticated user) |
| `create_additional_team(name)` | Creates new team for existing user |
| `switch_active_team(team_id)` | Changes active team, syncs role, clears active project |
| `leave_team(team_id)` | Removes own membership, auto-switches active team |
| `get_team_members(team_id, caller_id)` | Returns all members of a team |
| `get_team_assembly_years(team_id, caller_id)` | Returns distinct project years from assembly numbers |
| `update_member_role(team_id, user_id, role)` | Admin: change a member's role |
| `remove_team_member(team_id, user_id)` | Admin: remove a member |
| `delete_team_if_empty()` | Trigger: auto-deletes team when last member leaves |
| `save_onshape_credentials(team_id, access_key, secret_key)` | Admin: store OnShape API keys |
| `get_onshape_credentials(team_id)` | Any member: retrieve keys for server-side API use |
| `has_onshape_credentials(team_id)` | Any member: check if keys are configured (for UI state) |

---

## Phase 1: Core Foundation — COMPLETE

### Authentication & Teams ✓
- [x] Supabase Auth (username/password, no email confirmation)
- [x] Signup flow: creates team + founding project; user becomes team admin
- [x] Join flow: join an existing team by 6-char join code only (no team name required)
- [x] Multi-team: users can belong to multiple teams, switch active team from dashboard
- [x] Authenticated users can join additional teams or create new teams from the Teams panel
- [x] Auto-delete empty teams via DB trigger on `team_memberships` delete
- [x] Team admin RPCs: `update_member_role`, `remove_team_member`
- [x] Join code display in Teams panel and team page (with copy button)

### Projects ✓
- [x] `team_projects` table: `(team_id, year, suffix)` pairs, admin-managed
- [x] `active_project_code` stored per user in `user_profiles`; drives filtering and number suggestions
- [x] Project code format: `PP[L]` — 2-char year + optional letter (`26`, `26A`, `26B`)
- [x] Part/assembly number format: `PP[L]_T_NNN` — validated and auto-suggested from active project
- [x] `projectCode()` / `parseProjectCode()` helpers in `validation.ts`
- [x] SeasonPanel on team page: list projects, set active, add (admin), remove (admin)
- [x] Parts list page: filtered by active project code when set
- [x] Assemblies list page: filtered by active project code when set
- [x] New Part / New Assembly buttons disabled when no active project is selected

### Part & Assembly CRUD ✓
- [x] Assembly create, view, edit (name, description, CAD link, parent), delete
- [x] Part create, view, edit, delete
- [x] Part type: manufactured vs off-the-shelf (COTS)
- [x] BOM item created alongside part (required qty, spare qty, vendor, supplier P/N, purchase link)
- [x] Part number validation + auto-suggestion from parent assembly number
- [x] Naming conformance check (flags non-conformant names visually without blocking save)
- [x] Assembly number validation + auto-suggestion (next top-level or next sub within block)
- [x] Edit links on part and assembly detail pages; delete with confirmation dialogs

### Status & Collaboration ✓
- [x] Part statuses: Design → Ready for Manufacturing → In Progress → Complete → On Hold
- [x] Status history log per part (who changed it, when, optional notes)
- [x] Part assignment to team members (dropdown on part detail page)
- [x] Dashboard: stat cards (assemblies, total parts, in-progress, complete), parts-by-status breakdown, my assigned parts

### Team Management UI ✓
- [x] Team page (`/team/[id]`): accessible from navbar team name link and TeamsPanel team name links
- [x] Team page: displays member list with role, join date; join code with copy button; season years from assembly numbers
- [x] Team page: admin role dropdown per member (live update), remove member button (with confirmation)
- [x] Teams panel on dashboard: shows all teams user belongs to, active team highlighted, switch/leave buttons, join form, create form

---

## Phase 2: Polish & Remaining Foundation — COMPLETE

### 2a — Project Scoping Cleanup ✓
- [x] Remove "Season Year" field from signup; `complete_signup` creates team with no year; admin adds first project from team page
- [x] Dashboard stat cards and "My Assigned Parts" filter by `active_project_code` when set
- [x] Clear `active_project_code` when user switches active team
- [x] New Part / New Assembly forms: locked `{code}_P_` / `{code}_A_` prefix chip + NNN input when a project is active
- [x] Unify `getSeasonYY()` usages → `projectCode()` throughout

### 2b — Viewer Role Enforcement ✓
- [x] Read-only guard on all server actions: check role before any INSERT/UPDATE/DELETE, return error if viewer
- [x] UI: Edit/Delete/New Part/New Assembly/Status-update form hidden/disabled for viewer-role users
- [x] RLS policies: `part_status_history` insert policy tightened to require `admin | engineer`

### 2c — UX Hardening (partial)
- [x] Error boundaries: `error.tsx` added for app routes; `global-error.tsx` at root
- [x] Assembly page: inline status summary (count of parts per status) in the header
- [x] Part detail page: allow changing the assigned assembly via edit form
- [ ] Mobile layout audit: navbar collapses, forms scroll properly, team page is usable on small screens
- [ ] Enforce part number uniqueness within a project — surface conflicts in UI

---

## Phase 3: OnShape Integration — COMPLETE

### 3a — Credentials & Connection ✓
- [x] OnShape API key auth (HMAC-SHA256); auth format: `On {key}:HmacSHA256:{sig}` + `On-Nonce:` header
- [x] API keys stored in separate `team_onshape_credentials` table (admin-only RLS; isolated from main teams table)
- [x] Three security-definer RPCs: `save_onshape_credentials`, `get_onshape_credentials`, `has_onshape_credentials`
- [x] Test connection via `GET /api/documents?limit=1` (not `/users/sessioninfo` — that returns 204 for key auth)
- [x] Connection test UI on team page shows number of documents accessible

### 3b — BOM Import ✓
- [x] Assembly linked to OnShape by pasting the browser URL; parsed into docId/workspaceId/elementId
- [x] Import fetches **indented BOM** (`indented=true&multiLevel=true`) to capture full assembly hierarchy including sub-assemblies
- [x] `buildBomHierarchy()` reconstructs the tree from the ordered flat array using `indent`/`indentLevel` depth fields
- [x] Sub-assemblies auto-created with correct `parent_assembly_id`; assembly numbers auto-generated or taken directly from OnShape name if conformant
- [x] Parts assigned to their direct parent assembly (sub-assembly), not the root
- [x] Classification: `itemSource.isStandardContent = true` OR `wvmType = 'v'` (versioned external doc) → `off_shelf`; `wvmType = 'w'` (team workspace) → `manufactured`
- [x] COTS multi-body detection: same part modelled as multiple bodies in one part studio all share the same name; deduplicated per assembly level by name with quantities summed
- [x] Manufactured parts: deduplicated by (elementId, name) within a level; cross-element accumulation handled via `createdThisLevel` map during import
- [x] Manufactured parts: if OnShape name matches `PP_P_NNN` format, used directly as part number; otherwise auto-assigned
- [x] `naming_flagged = true` for any imported part whose name doesn't conform to team conventions
- [x] OnShape CAD link (`cad_link`) set from `itemSource.viewHref` on every imported part and assembly
- [x] OnShape sync fields stored: `onshape_doc_id`, `onshape_element_id`, `onshape_part_id`, `onshape_workspace_id`
- [x] BOM cache (`onshape_bom_cache`) with 5-minute TTL; flat and indented BOMs cached under separate keys
- [x] Thumbnail proxy route `/api/onshape/thumbnail?partId=` — fetches shaded view on demand, not cached in storage

### 3c — Sync ✓
- [x] Incremental sync diff: `/api/onshape/sync-diff` compares live OnShape BOM to DB state; result stored in `onshape_sync_diffs`
- [x] Diff review UI on assembly page (grouped added/qty-changed/removed with counts; confirm before applying)
- [x] `/api/onshape/sync-apply` applies a stored diff: creates added parts, updates quantities, sets removed parts to On Hold with history note
- [x] 5-minute BOM cache shared across import and sync to avoid hammering the OnShape API
- [ ] OnShape webhook or polling for real-time change notifications (stretch goal, Phase 5)

### Phase 3 — Additional features added beyond original plan
- [x] **Inline qty editor on assembly page**: per-assembly quantity editable in-place with ✓/✕ buttons; calls `updatePartBomQuantity` server action
- [x] **Spare qty always global**: spare qty displayed as the sum across all assemblies that use the part
- [x] **"OS Imported" badge**: cyan `OS` badge on all parts imported from OnShape across assembly page, parts page, and part detail
- [x] **Propagate edits to like parts**: edit form checkbox — when checked, changes to name, description, type, part number, CAD link, vendor info propagate to every part in the project with the same OnShape identity
- [x] **Parts page deduplication**: OnShape-imported parts shown once per unique name; quantities and spare summed; all source assemblies listed as links; worst status shown
- [x] **Part type override**: edit form allows changing type between manufactured ↔ off_shelf; triggers COTS field show/hide dynamically
- [x] **Editable part number**: part number field unlocked in edit form; validates `PP_P_NNN` format for manufactured, free-form for off_shelf
- [x] **Qty required read-only on edit page**: assembly-specific quantity not editable from part edit form; tooltip directs user to assembly page

### Phase 3 — Key deviations from original plan

| Original plan | What was actually built | Why |
|---|---|---|
| OAuth2 or API key auth | API key only (HMAC-SHA256) | OAuth2 requires a registered app in OnShape developer portal; API keys are simpler and sufficient for team use |
| Store credentials in `teams.settings` JSONB | Separate `team_onshape_credentials` table | Needed proper RLS isolation so viewers cannot read raw API keys |
| Test connection via `/api/users/sessioninfo` | Test via `GET /api/documents?limit=1` | `sessioninfo` returns 204 No Content for API key auth (it is an OAuth-only endpoint) |
| Flat BOM import of parts only | Indented BOM import with full hierarchy | Flat BOM only returns leaf-level parts; sub-assemblies require `indented=true&multiLevel=true` |
| `itemSource` as a string ("ORIGINAL"/"PURCHASED") | `itemSource` is an object with `documentId`, `elementId`, `partId`, `wvmId`, `wvmType`, `isStandardContent` | Actual OnShape API response structure differs entirely from assumed |
| Dedup by `(elementId, partId)` | Type-aware: COTS by name, manufactured by (elementId, name) | Multi-body COTS parts in the same studio share a name but have different partIds; name is the correct COTS identifier |
| Cache BOM thumbnails in Supabase Storage | Proxy on demand via `/api/onshape/thumbnail` | Caching in Storage adds complexity; on-demand proxy is sufficient and keeps storage clean |
| BOM import creates all parts under root assembly | Parts created under their direct parent sub-assembly | Hierarchical BOM is required to determine correct parent; flat BOM loses sub-assembly context |

---

## Phase 4: COTS Order Aggregation — COMPLETE

**Context from Phase 3**: The BOM import populates `cots_vendor`, `cots_supplier_part_number`, and `cots_purchase_link` for off_shelf parts. These fields are blank on initial import — the team must fill them in via the part edit form. The "propagate to like parts" feature makes it practical to set vendor info once and push to all identical parts in the project. The parts page already deduplicates COTS parts by name with summed quantities, so the order view can build directly on that data model.

- [x] **COTS order view** (`/orders`): all off-the-shelf parts across all assemblies for the active project, deduplicated by name with summed required + spare quantities
- [x] Display per line item: Assembly source list · Required · + Spare · = Total Order Qty
- [x] **Vendor filter tabs** matching `DEFAULT_COTS_VENDORS`: WCP, AndyMark, REV, ThriftyBot, Amazon, VEXpro, Other
- [x] **Quick-order link** per line item (opens `cots_purchase_link` in new tab)
- [x] **Order status** per vendor group: Pending → Ordered → Received; stored in `cots_orders` table keyed by `(team_id, project_code, vendor)` with upsert
- [x] Mark individual parts as received within an order (checkbox per line; updates all matching `bom_items.cots_received`)
- [x] **Export to CSV**: columns — Part Name, Part Number, Vendor, Supplier P/N, Qty Required, Spare Qty, Total Qty, Purchase Link
- [x] Parts without vendor/supplier info shown in "Needs Info" tab with ⚠ highlight; excluded from vendor groups
- [x] Aggregate identical parts by `(name, cots_supplier_part_number)` when supplier P/N is populated; fall back to name-only when it is not
- [x] **Orders link** added to Navbar

**Schema additions (migration `phase4_cots_orders`):**
- `cots_orders` table with RLS; unique on `(team_id, project_code, vendor)`; index on `(team_id, project_code)`
- `bom_items.cots_received` boolean column (default false) for per-line received tracking

**Key implementation decisions:**
- Vendor tabs are client-side state (no URL param needed — data is all loaded server-side)
- Received state = OR of all bom_items for the deduplicated line; clicking toggles all matching part IDs at once
- "Needs Info" lines (missing vendor OR supplier PN) are segregated to their own tab to keep vendor groups clean
- dedup key: `name::supplierPN` when supplier PN set, else `name` (matches parts page logic)

---

## Phase 5: Manufacturing Workflow

**Context from Phase 3 & 4**: Every manufactured part carries `onshape_element_id` + `onshape_part_id` + `cad_link`. The CAD export is a **pass-through only** — files are fetched from OnShape's export API on demand and streamed directly to the browser. No CAD files are stored in the application or Supabase Storage at any point. The `part_manufacturing` table and `manufacturing_processes` table already exist and are seeded with default processes (3D Printing, Laser Cut, CNC Mill, CNC Lathe, Hand Fabrication, Welding, Sheet Metal). The `cad_link` on each part opens the part directly in OnShape.

**CAD export formats supported**: STL (3D printing / visualization), STEP (CNC / CAM software import), DXF (laser cut / sheet metal). No PDF — use OnShape's native drawing environment for print-ready drawings.

- [ ] **Assign processes to a part**: one or more processes per manufactured part using existing `part_manufacturing` table; shown on part detail page
- [ ] **Outsourced flag**: checkbox on part edit/manufacturing form; exposes vendor name field
- [ ] **CAD export buttons** on part detail page (only for parts with `onshape_element_id`): three buttons — STL · STEP · DXF — each calls a Next.js API route that proxies the OnShape export API and streams the file directly to the browser; no file stored server-side
- [ ] **Manufacturing status pipeline**: `not_started → in_progress → qc → done` per `part_manufacturing` record (separate from the part's overall status)
- [ ] **Process-level assignment**: assign a team member to each manufacturing operation
- [ ] **Manufacturing queue view** (`/manufacturing`): all parts in `ready_for_manufacturing` or `in_progress` status, grouped by process; filtered to active project
- [ ] Queue shows: part number, assembly, assigned engineer, CAD export buttons (STL/STEP/DXF), OnShape link
- [ ] **Batch status update**: select multiple parts in queue → mark all as In Progress or Complete
- [ ] Parts without `onshape_element_id` show CAD export buttons as disabled with tooltip "No OnShape link"

---

## Phase 6: Deploy & Audit

**Context from Phase 3**: Several new tables need ongoing maintenance: `onshape_bom_cache` entries older than 5 minutes are stale but persist indefinitely (code checks TTL but never deletes); `onshape_sync_diffs` accumulates indefinitely (applied diffs are never cleaned up). These should be addressed in the deploy phase. The name-based part dedup uses `lower(trim(name))` comparisons in hot paths — adding a functional index would help at scale.

- [ ] **Production deployment** to Vercel; configure all environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- [ ] **DB indexes**: `parts(team_id, lower(name))` for name-based dedup queries; `parts(team_id, part_number)`, `assemblies(team_id, assembly_number)`, `team_memberships(user_id)`
- [ ] **BOM cache cleanup**: scheduled job or DB trigger to delete `onshape_bom_cache` rows older than 1 hour
- [ ] **Sync diff cleanup**: delete `onshape_sync_diffs` rows where `applied = true` and `applied_at < now() - 30 days`
- [ ] **Admin audit log**: extend the `part_status_history` pattern to cover part/assembly edits and deletes (who changed what, when)
- [ ] **Email notifications** on status change for assigned team members (Supabase Edge Functions)
- [ ] **Load testing**: verify stability under typical team usage (20–50 concurrent users)
- [ ] Mobile layout audit: navbar collapses, forms scroll properly on small screens (carried over from Phase 2c)
- [ ] Enforce part number uniqueness within a project — surface conflicts in UI (carried over from Phase 2c)

---

## Key Design Decisions (recorded)

| Decision | Choice | Reason |
|---|---|---|
| Part number prefix | 2–3 char `PP[L]` | Supports multiple projects per year without collision; letter suffix is human-readable |
| Season vs Project | Projects `(year, suffix)` | Teams often run multiple robots per year; letter suffix is intuitive and compact |
| Multi-team | Supported from day 1 | Mentors span multiple teams; students carry membership across seasons |
| Active project scope | Per-user preference | Different members may work across projects simultaneously |
| Join code charset | No O/0/I/1 | Reduces verbal/handwriting ambiguity when sharing codes |
| auth.uid() in RPCs | Replaced with explicit p_caller_id | auth.uid() is unreliable inside security-definer functions when called from Next.js server components |
| Empty team cleanup | DB trigger on team_memberships delete | Ensures orphaned teams are removed regardless of which code path deletes the last member |
| Supabase CLI | Binary installed to %LOCALAPPDATA%\supabase\ and added to user PATH | npm global install not supported; WinGet package unavailable; direct binary from GitHub releases |
| OnShape auth scheme | HMAC-SHA256 API keys; `On key:HmacSHA256:sig` + `On-Nonce:` header | OAuth2 requires registered app; API keys are self-service. The Authorization header format and nonce header are not widely documented correctly — derived from OnShape API docs directly |
| OnShape test endpoint | `GET /api/documents?limit=1` | `/api/users/sessioninfo` returns 204 for API key auth (it is session/OAuth only) |
| OnShape credential storage | Separate `team_onshape_credentials` table | `teams.settings` JSONB is readable by all team members; separate table allows admin-only RLS without touching the teams table |
| BOM classification | `itemSource.wvmType = 'v'` → off_shelf; `'w'` → manufactured | Versioned external documents (COTS library parts) vs team workspace parts; more reliable than `isStandardContent` alone |
| Part identity key | Name-based dedup (not elementId+partId) | Multi-body COTS parts produce multiple BOM rows with different partIds but the same name; the same part can appear from different element contexts across sub-assemblies |
| COTS vs manufactured dedup | COTS: name only; manufactured: (elementId, name) within level, name-matched at DB level | COTS product name is the identity; manufactured parts from different elements with the same part number represent the same design and should accumulate |
| BOM import mode | Indented BOM (`indented=true&multiLevel=true`) | Flat BOM returns only leaf-level parts; sub-assembly hierarchy requires the indented form |
| Assembly qty ownership | Per-assembly; edited only from assembly page inline editor | Qty is determined by the assembly design; the part edit page shows it read-only to prevent confusion |
| Spare qty ownership | Global project total (summed across all assemblies) | Spares are ordered once for the whole project; per-assembly spare tracking would under-order |
| Propagate edits | Opt-in checkbox on part edit; applies to all parts with same OnShape identity | Enables bulk correction after import (e.g., marking all WCP-0940 as off_shelf) without requiring individual edits |

---

## Success Criteria

- [x] Team imports full BOM from OnShape with auto-populated quantities, part numbers, and sub-assembly hierarchy
- [x] COTS parts auto-detected and grouped by vendor/part# into unified ordering interface
- [x] Required and spare quantities displayed separately and clearly (required per-assembly, spare as project total)
- [x] Manufactured parts locked to OnShape names with visual flags for non-conformant naming
- [x] Duplicate COTS parts across assemblies automatically aggregated (show source assemblies, summed quantities)
- [x] Active project correctly scopes all list views, forms, and number suggestions
- [x] Viewer role enforced — read-only users cannot mutate data via UI or API
- [ ] App works reliably under typical team usage (20–50 concurrent users)
- [ ] Full manufacturing workflow tracked from design through QC for all manufactured parts
