// Database types derived from schema
export type UserRole = 'admin' | 'engineer' | 'viewer';
export type PartType = 'manufactured' | 'off_shelf';
export type PartStatus = 'design' | 'ready_for_manufacturing' | 'in_progress' | 'complete' | 'on_hold';
export type ManufacturingStatus = 'not_started' | 'in_progress' | 'complete';

export interface Team {
  id: string;
  name: string;
  year: number;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  team_id: string | null;
  created_at: string;
}

export interface Assembly {
  id: string;
  assembly_number: string;
  name: string;
  description: string | null;
  cad_link: string | null;
  onshape_doc_id: string | null;
  parent_assembly_id: string | null;
  team_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Part {
  id: string;
  part_number: string | null;
  name: string;
  description: string | null;
  assembly_id: string;
  cad_link: string | null;
  status: PartStatus;
  assigned_to: string | null;
  type: PartType;
  naming_flagged: boolean;
  team_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BomItem {
  id: string;
  assembly_id: string;
  part_id: string;
  onshape_quantity: number;
  cots_supplier_part_number: string | null;
  cots_quantity: number | null;
  cots_quantity_spare: number;
  cots_purchase_link: string | null;
  cots_vendor: string | null;
  created_at: string;
}

export interface ManufacturingProcess {
  id: string;
  team_id: string;
  name: string;
  created_at: string;
}

export interface PartManufacturing {
  id: string;
  part_id: string;
  process_id: string | null;
  outsourced: boolean;
  vendor: string | null;
  export_file_format: string | null;
  status: ManufacturingStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartStatusHistory {
  id: string;
  part_id: string;
  status: PartStatus;
  changed_at: string;
  changed_by: string | null;
  notes: string | null;
}

// Joined types for UI use
export interface AssemblyWithParts extends Assembly {
  parts?: Part[];
  part_count?: number;
}

export interface PartWithAssembly extends Part {
  assembly?: Assembly;
  assigned_user?: UserProfile;
}

export const PART_STATUS_LABELS: Record<PartStatus, string> = {
  design: 'Design',
  ready_for_manufacturing: 'Ready for Manufacturing',
  in_progress: 'In Progress',
  complete: 'Complete',
  on_hold: 'On Hold',
};

export const PART_STATUS_COLORS: Record<PartStatus, string> = {
  design: 'bg-blue-900/50 text-blue-300',
  ready_for_manufacturing: 'bg-yellow-900/50 text-yellow-300',
  in_progress: 'bg-orange-900/50 text-orange-300',
  complete: 'bg-green-900/50 text-green-300',
  on_hold: 'bg-gray-700 text-gray-300',
};

export const DEFAULT_COTS_VENDORS = [
  'West Coast Products',
  'AndyMark',
  'ThriftyBot',
  'Amazon',
  'REV Robotics',
  'VEXpro',
  'Other',
];
