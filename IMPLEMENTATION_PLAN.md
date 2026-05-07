# FRC Part Tracker Web App - Implementation Plan

## Problem Statement
Build a cloud-hosted web application for FRC teams to track parts and subassemblies through the design and manufacturing process, integrating with OnShape CAD for BOM management, supporting both off-the-shelf and manufactured parts with manufacturing workflow tracking.

## Approach & Tech Stack Decision
**Recommended Stack: Next.js + TypeScript + PostgreSQL + Vercel + Supabase**
- **Frontend**: Next.js (App Router) with React for fast iteration, built-in API routes, and easy deployment
- **Backend**: Next.js API routes (serverless) for simplicity and cost-efficiency
- **Database**: PostgreSQL via Supabase (free tier includes 500MB storage, perfect for initial launch)
- **Hosting**: Vercel (free tier, auto-deploys from GitHub, ideal for Next.js)
- **Authentication**: Supabase Auth with role-based access control (RBAC)
- **External API**: OnShape API for CAD integration and BOM pulling

**Rationale**: Minimizes complexity, free tier covers startup needs, scales well, full-stack TypeScript reduces errors.

## Database Schema Overview
- **Users**: id, email, name, role (admin|engineer|viewer), team_id
- **Teams**: id, name, year, settings
- **Assemblies**: id, assembly_number (26_A_100), name, cad_link, parent_assembly_id, onshape_doc_id
- **Parts**: id, part_number (26_P_101), onshape_part_name, name (locked from OnShape), assembly_id, cad_link, status, assigned_to, type (manufactured|off_shelf), naming_flagged (bool)
- **BOM_Items**: id, assembly_id, part_id, onshape_quantity, cots_supplier_part_number, cots_quantity, cots_quantity_spare, cots_purchase_link, cots_vendor
- **Manufacturing_Processes**: id, team_id, name (3D Print, Laser Cut, CNC, etc.)
- **Part_Manufacturing**: id, part_id, process_id, outsourced, vendor, export_file_format, status
- **Part_Status_History**: id, part_id, status, changed_at, changed_by
- **COTS_Order_Summary**: id, team_id, vendor, aggregated_items (JSON: [{part_number, part_name, quantity_required, quantity_spare, purchase_link, assemblies}]), order_status

## Feature Breakdown & Implementation Phases

### Phase 1: Core Foundation (Weeks 1-2)
- [ ] Project setup: Next.js, Supabase, Vercel, GitHub repo
- [ ] Database schema creation
- [ ] User authentication & role-based access (Supabase Auth)
- [ ] Part/Assembly number validation logic (YY_A/P_### format)
- [ ] Basic CRUD UI for assemblies and parts
- [ ] Manual part number entry workflow

### Phase 2: OnShape Integration & BOM Template (Weeks 3-4)
- [ ] OnShape API authentication flow
- [ ] Bulk BOM import from OnShape assembly (auto-fetch all parts and quantities)
- [ ] Auto-classification: flag COTS vs manufactured parts based on OnShape metadata
- [ ] Auto-assign YY_P_### part numbers to manufactured parts (sequential generation)
- [ ] Lock part names to OnShape names, flag non-conformant naming (warn but don't block)
- [ ] Isometric view image generation/display (OnShape API)
- [ ] Minimum data entry workflow (vendor/part# for COTS, manufacturing method for custom)

### Phase 3: COTS Order Aggregation & Sourcing (Weeks 4-5)
- [ ] Unified COTS order interface showing all off-shelf parts across assemblies
- [ ] Auto-aggregate duplicate COTS parts by vendor/part# (sum quantities)
- [ ] Display format: Required Qty | + Spare Qty | = Total Order (per line item)
- [ ] Vendor filtering (WestCoastProducts, Andymark, ThriftyBot, Amazon, custom)
- [ ] Purchase link storage and quick-order link generation
- [ ] Order status tracking and export capability

### Phase 4: Manufacturing Workflow (Weeks 5-7)
- [ ] Manufacturing process library (in-house capabilities)
- [ ] Process selection UI (dropdown + custom add process)
- [ ] Outsourced part handling (vendor selection, export file formats)
- [ ] Export CAD files to user-selected format (PDF, STEP, DXF, etc.)
- [ ] Manufacturing status tracking pipeline

### Phase 5: Team Collaboration (Weeks 7-8)
- [ ] Part assignment to team members
- [ ] Status tracking (Design, Ready for Manufacturing, In Progress, Complete, etc.)
- [ ] Activity/history log for each part
- [ ] Dashboard overview (status counts, assigned parts, bottlenecks)

### Phase 6: Polish & Deploy (Week 8+)
- [ ] Testing (unit tests for validation, integration tests with OnShape API)
- [ ] UX refinements based on feedback
- [ ] Mobile-friendly responsive design
- [ ] Production deployment to Vercel
- [ ] Documentation and team training

## Key Considerations
- **OnShape BOM Import**: Minimize user data entry—auto-populate part names, quantities, and detect COTS vs manufactured based on OnShape metadata
- **Auto-generated Part Numbers**: Sequentially assign YY_P_### to manufactured parts; warn if OnShape part names don't match convention
- **COTS Aggregation Logic**: Group identical parts (vendor + part#) across multiple assemblies and sum quantities for unified ordering interface
- **Required vs Spare Tracking**: Display separately to allow quick visibility of actual robot needs vs buffer stock
- **OnShape API Rate Limits**: Implement caching to avoid excessive API calls
- **Image Display**: OnShape API image downloads should be cached locally for performance
- **Export Formats**: Determine supported file types (PDF, STEP, DXF, SVG) based on team needs
- **Scalability**: Design database queries for efficient filtering/searching as part count grows
- **Backup Strategy**: Regular backups of Supabase database

## Success Criteria
- [ ] Team can import full BOM from OnShape assembly with auto-populated quantities and auto-assigned YY_P_### part numbers
- [ ] COTS parts auto-detected and grouped by vendor/part# into unified ordering interface
- [ ] Required and spare quantities displayed separately and clearly
- [ ] Manufactured parts locked to OnShape names with visual flags for non-conformant naming
- [ ] Duplicate COTS parts across assemblies automatically aggregated (show source assemblies)
- [ ] Team members can assign/reassign parts and update manufacturing status
- [ ] Role-based access controls enforce permissions
- [ ] App loads fast and works reliably under typical team usage
