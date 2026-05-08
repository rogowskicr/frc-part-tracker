# ORF 4450 Part Tracker — Implementation Plan

## Problem Statement
A cloud-hosted web application for FRC teams to track parts and subassemblies through design and manufacturing, integrating with OnShape CAD for BOM management. Supports off-the-shelf and manufactured parts, manufacturing workflow tracking, and team collaboration.

## Stack
- **Frontend/Backend**: Next.js (App Router) + TypeScript
- **Database**: PostgreSQL via Supabase (RLS, RPCs, Auth)
- **Hosting**: Vercel
- **External API**: OnShape (Phase 3)

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
- Switching active team does not change the active project (it may become stale; future work to clear it).

### Roles — `admin | engineer | viewer`
- `admin`: full access plus team/project management, member role changes, member removal
- `engineer`: full part/assembly CRUD and status updates
- `viewer`: read-only (DB-level RLS partially enforced; UI guards not yet complete)

---

## Database Schema (current)

| Table | Key columns |
|---|---|
| `teams` | id, name, join_code |
| `user_profiles` | id, name, team_id (active), role, active_project_code |
| `team_memberships` | user_id, team_id, role, joined_at |
| `team_projects` | team_id, year, suffix (text, '' or A–Z), created_at |
| `assemblies` | id, team_id, assembly_number, name, description, cad_link, parent_assembly_id |
| `parts` | id, team_id, assembly_id, part_number, name, description, type, status, assigned_to, cad_link, naming_flagged |
| `bom_items` | id, assembly_id, part_id, onshape_quantity, cots_quantity, cots_quantity_spare, cots_vendor, cots_supplier_part_number, cots_purchase_link |
| `part_status_history` | id, part_id, status, changed_at, changed_by, notes |
| `manufacturing_processes` | id, team_id, name |

### Security-definer RPCs (callable by authenticated role)
| Function | Purpose |
|---|---|
| `complete_signup(name, year, username)` | Creates team + founding project + default mfg processes |
| `join_team(join_code, username)` | Joins existing team by code (signup flow) |
| `add_team_membership(join_code)` | Joins additional team (authenticated user) |
| `create_additional_team(name, year)` | Creates new team for existing user |
| `switch_active_team(team_id)` | Changes active team, syncs role |
| `leave_team(team_id)` | Removes own membership, auto-switches active team |
| `get_team_members(team_id, caller_id)` | Returns all members of a team |
| `get_team_assembly_years(team_id, caller_id)` | Returns distinct project years from assembly numbers |
| `update_member_role(team_id, user_id, role)` | Admin: change a member's role |
| `remove_team_member(team_id, user_id)` | Admin: remove a member |
| `delete_team_if_empty()` | Trigger: auto-deletes team when last member leaves |

---

## Phase 1: Core Foundation — COMPLETE (with gaps noted)

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

### Known Phase 1 Gaps
- [ ] **Viewer role UI enforcement**: all authenticated members can currently mutate data regardless of role; viewer guard needed on forms and action buttons
- [ ] **Dashboard not project-scoped**: stat cards and "My Assigned Parts" list show all-project data even when an active project is set
- [ ] **Signup still collects Season Year**: the "Create a team" path in signup passes `team_year` to `complete_signup`. Since projects are now the canonical year container, this field is redundant and confusing. Signup should create a team with no year and prompt the admin to add their first project from the team page after signing in.
- [ ] **Switching active team doesn't clear active project**: a stale `active_project_code` from the previous team remains set and may not match any project on the new team
- [ ] **`getSeasonYY()` still referenced** in some form hints alongside the newer `projectCode()` — should be unified

---

## Phase 2: Polish & Remaining Foundation

These items close the Phase 1 gaps and add quality-of-life improvements before OnShape integration begins.

### 2a — Project Scoping Cleanup
- [ ] Remove "Season Year" field from signup; `complete_signup` creates team with no year; admin adds first project from team page
- [ ] Dashboard stat cards and "My Assigned Parts" filter by `active_project_code` when set
- [ ] Clear `active_project_code` when user switches active team (in `switch_active_team` RPC or client action)
- [ ] New Part / New Assembly forms: show the active project code prefix as a locked label rather than a free-form input when a project is active
- [ ] Unify `getSeasonYY()` usages → `projectCode()` throughout

### 2b — Viewer Role Enforcement
- [ ] Read-only guard on all server actions: check `my_role()` before any INSERT/UPDATE/DELETE, return error if viewer
- [ ] UI: hide or disable mutating buttons (Edit, Delete, New Part, Status update) for viewer-role users
- [ ] RLS policies: tighten insert/update/delete policies to reject viewer role at the DB level (currently `engineer | admin` required but not verified for all tables)

### 2c — UX Hardening
- [ ] Error boundaries around Supabase queries — graceful fallback UI instead of blank pages on network failure
- [ ] Mobile layout audit: navbar collapses, forms scroll properly, team page is usable on small screens
- [ ] Enforce part number uniqueness within a project (currently unique per `(team_id, part_number)` only at DB level; surface conflicts in UI)
- [ ] Assembly page: inline status summary (count of parts per status) in the header
- [ ] Part detail page: allow changing the assigned assembly (currently locked after creation)

---

## Phase 3: OnShape Integration

### 3a — Credentials & Connection
- [ ] OnShape OAuth2 or API key configuration (per-team, stored encrypted in Supabase secrets or team settings JSONB)
- [ ] Test connection UI on team page — confirm the API key is valid before import

### 3b — BOM Import
- [ ] Assembly BOM import: given an OnShape document/assembly URL, fetch all child parts with quantities via OnShape API
- [ ] Auto-create assemblies and parts from BOM (preserving OnShape part names as `name`, locking to OnShape naming)
- [ ] Auto-classify: COTS vs manufactured based on OnShape metadata (material, appearance, or naming patterns)
- [ ] Auto-assign `PP[L]_P_NNN` numbers to manufactured parts sequentially within the active project
- [ ] Set `naming_flagged = true` for any part whose OnShape name doesn't conform to team naming conventions
- [ ] Store `onshape_doc_id`, `onshape_element_id`, `onshape_part_id` on parts and assemblies for sync
- [ ] Isometric view image: fetch from OnShape API, cache in Supabase Storage, display on part detail page

### 3c — Sync
- [ ] Incremental sync: re-import BOM and show a diff (added/removed/qty-changed parts) before applying
- [ ] OnShape API rate limiting + response caching layer (avoid re-fetching within configurable TTL)
- [ ] OnShape webhook or polling for real-time BOM change notifications (Phase 5 stretch)

---

## Phase 4: COTS Order Aggregation

- [ ] COTS order view: all off-the-shelf parts across all assemblies for the active project
- [ ] Auto-aggregate identical parts by `(cots_vendor, cots_supplier_part_number)` — sum required + spare quantities
- [ ] Display per line item: Required | + Spare | = Total, with source assemblies listed as expandable detail
- [ ] Vendor filter tabs (AndyMark, WCP, REV, ThriftyBot, Amazon, Other)
- [ ] Quick-order link per line item (opens `cots_purchase_link`)
- [ ] Order status per vendor group: Pending → Ordered → Received (stored in new `cots_orders` table)
- [ ] Export to CSV (for purchasing and budget records)

---

## Phase 5: Manufacturing Workflow

- [ ] Manufacturing process library per team (already seeded: 3D Printing, Laser Cut, CNC Mill, CNC Lathe, Hand Fabrication, Welding, Sheet Metal)
- [ ] Assign one or more processes to a manufactured part (using existing `part_manufacturing` table)
- [ ] Outsourced flag: vendor name + export file format selection (PDF/STEP/DXF)
- [ ] CAD export: trigger OnShape export and download (requires Phase 3)
- [ ] Manufacturing status pipeline: Queued → In Progress → QC → Done (separate from part status)
- [ ] Process-level assignment: who is running each specific manufacturing operation
- [ ] Manufacturing queue view: all parts ready for a given process, grouped by machine/operator

---

## Phase 6: Deploy & Audit

- [ ] Production deployment to Vercel with full environment variable configuration
- [ ] Performance: DB indexes on `parts(team_id, part_number)`, `assemblies(team_id, assembly_number)`, `team_memberships(user_id)`
- [ ] Admin audit log: extend the `part_status_history` pattern to cover part/assembly edits and deletes
- [ ] Email notifications on status change for assigned team members (Supabase Edge Functions)
- [ ] Load testing: verify stability under typical team usage (20–50 concurrent users)

---

## Key Design Decisions (recorded)

| Decision | Choice | Reason |
|---|---|---|
| Part number prefix | 2–3 char `PP[L]` | Supports multiple projects per year without collision; letter suffix is human-readable |
| Season vs Project | Projects `(year, suffix)` | Teams often run multiple robots per year; letter suffix is intuitive and compact |
| Multi-team | Supported from day 1 | Mentors span multiple teams; students carry membership across seasons |
| Active project scope | Per-user preference | Different members may work across projects simultaneously |
| Join code charset | No O/0/I/1 | Reduces verbal/handwriting ambiguity when sharing codes |
| Team year on signup | Still present (gap) | Functionally needed to seed the founding project; plan to remove when signup creates a year-free team and prompts admin to add first project |
| auth.uid() in RPCs | Replaced with explicit p_caller_id | auth.uid() is unreliable inside security-definer functions when called from Next.js server components; explicit param is safer |
| Empty team cleanup | DB trigger on team_memberships delete | Ensures orphaned teams are removed regardless of which code path deletes the last member |
| Supabase CLI | Binary installed to %LOCALAPPDATA%\supabase\ and added to user PATH | npm global install not supported; WinGet package unavailable; direct binary from GitHub releases |

---

## Success Criteria
- [ ] Team imports full BOM from OnShape with auto-populated quantities and part numbers
- [ ] COTS parts auto-detected and grouped by vendor/part# into unified ordering interface
- [ ] Required and spare quantities displayed separately and clearly
- [ ] Manufactured parts locked to OnShape names with visual flags for non-conformant naming
- [ ] Duplicate COTS parts across assemblies automatically aggregated (show source assemblies)
- [ ] Active project correctly scopes all list views, forms, and number suggestions
- [ ] Viewer role enforced — read-only users cannot mutate data via UI or API
- [ ] App works reliably under typical team usage (20–50 concurrent users)
- [ ] Full manufacturing workflow tracked from design through QC for all manufactured parts
