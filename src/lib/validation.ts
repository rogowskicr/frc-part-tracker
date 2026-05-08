/**
 * Part/Assembly number validation and generation utilities.
 *
 * Format: PP_A_NNN (assembly) or PP_P_NNN (part)
 *   PP   = project code: 2-digit year suffix, or 2-digit year + 1 letter suffix
 *          No suffix:     "26"  (year 2026, base project) → 26_A_100
 *          Letter suffix: "26A" (year 2026, project A)    → 26A_A_100
 *   A/P  = 'A' for assembly, 'P' for part
 *   NNN  = 3+ digit sequential number
 *
 * Top-level assemblies increment by 100: 26_A_100, 26_A_200
 * Sub-assemblies increment by 1 within a group: 26_A_101, 26_A_102
 * Parts start from their parent assembly number + 1: 26_P_101, 26_P_102
 */

// Prefix is 2 digits (base project) or 2 digits + 1 uppercase letter (lettered project)
const PREFIX_RE     = '\\d{2}[A-Z]?';
const ASSEMBLY_REGEX = new RegExp(`^(${PREFIX_RE})_A_(\\d{3,})$`);
const PART_REGEX     = new RegExp(`^(${PREFIX_RE})_P_(\\d{3,})$`);
const EITHER_REGEX   = new RegExp(`^(${PREFIX_RE})_[AP]_(\\d{3,})$`);

export function isValidAssemblyNumber(value: string): boolean {
  return ASSEMBLY_REGEX.test(value);
}

export function isValidPartNumber(value: string): boolean {
  return PART_REGEX.test(value);
}

export function isValidPartOrAssemblyNumber(value: string): boolean {
  return EITHER_REGEX.test(value);
}

export function validatePartNumber(value: string): string | null {
  if (!value) return 'Part number is required';
  if (!PART_REGEX.test(value)) {
    return 'Part number must follow the format PP_P_NNN (e.g. 26_P_101 or 26A_P_101)';
  }
  return null;
}

export function validateAssemblyNumber(value: string): string | null {
  if (!value) return 'Assembly number is required';
  if (!ASSEMBLY_REGEX.test(value)) {
    return 'Assembly number must follow the format PP_A_NNN (e.g. 26_A_100 or 26A_A_100)';
  }
  return null;
}

export function extractNumber(partNumber: string): number | null {
  const match = partNumber.match(EITHER_REGEX);
  if (!match) return null;
  return parseInt(match[2], 10);
}

/** Returns the project prefix from a part/assembly number (e.g. "26" or "26A"). */
export function extractPrefix(partNumber: string): string | null {
  const match = partNumber.match(EITHER_REGEX);
  return match ? match[1] : null;
}

export const extractYear = extractPrefix;

// ─── Project code helpers ──────────────────────────────────────────────────────

/**
 * Build a project code from year + letter suffix.
 *   projectCode(2026, '')  → "26"
 *   projectCode(2026, 'A') → "26A"
 */
export function projectCode(year: number, suffix: string): string {
  const yy = String(year).slice(-2);
  return suffix ? `${yy}${suffix.toUpperCase()}` : yy;
}

/** Parse a project code back into year + suffix. Returns null if invalid. */
export function parseProjectCode(code: string): { year: number; suffix: string } | null {
  if (!/^\d{2}[A-Z]?$/.test(code)) return null;
  const yy   = parseInt(code.slice(0, 2), 10);
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
  return { year, suffix: code.length === 3 ? code[2] : '' };
}

/** Default project code for the current year with no suffix. */
export function defaultProjectCode(): string {
  return String(getCurrentSeasonYear()).slice(-2);
}

// ─── Number suggestion helpers ─────────────────────────────────────────────────

/**
 * Given a project code and existing assembly numbers, suggest the next
 * top-level assembly number (multiples of 100).
 */
export function nextTopLevelAssemblyNumber(code: string, existingNumbers: string[]): string {
  const prefix = `${code}_A_`;
  const nums = existingNumbers
    .filter((n) => n.startsWith(prefix))
    .map(extractNumber)
    .filter((n): n is number => n !== null);

  const topLevel = nums.filter((n) => n % 100 === 0);
  const next = topLevel.length > 0 ? Math.max(...topLevel) + 100 : 100;
  return `${code}_A_${next}`;
}

/**
 * Given a parent assembly number and existing part numbers, suggest the next part number.
 */
export function nextPartNumber(parentAssemblyNumber: string, existingPartNumbers: string[]): string {
  const prefix    = extractPrefix(parentAssemblyNumber);
  const parentNum = extractNumber(parentAssemblyNumber);
  if (!prefix || parentNum === null) return '';

  const partsInGroup = existingPartNumbers
    .filter((n) => n.startsWith(`${prefix}_P_`))
    .map(extractNumber)
    .filter((n): n is number => n !== null && n > parentNum && n < parentNum + 100);

  const next = partsInGroup.length > 0 ? Math.max(...partsInGroup) + 1 : parentNum + 1;
  return `${prefix}_P_${next}`;
}

/**
 * Given an existing assembly number and all assembly numbers, suggest the next
 * sub-assembly number (increments by 1 within the 100-block).
 */
export function nextSubAssemblyNumber(parentAssemblyNumber: string, existingNumbers: string[]): string {
  const prefix    = extractPrefix(parentAssemblyNumber);
  const parentNum = extractNumber(parentAssemblyNumber);
  if (!prefix || parentNum === null) return '';

  const base = Math.floor(parentNum / 100) * 100;
  const subAssemblies = existingNumbers
    .filter((n) => n.startsWith(`${prefix}_A_`))
    .map(extractNumber)
    .filter((n): n is number => n !== null && n > base && n < base + 100);

  const next = subAssemblies.length > 0 ? Math.max(...subAssemblies) + 1 : base + 1;
  return `${prefix}_A_${next}`;
}

export function checkNamingConformance(name: string, expectedFormat: 'assembly' | 'part'): {
  conforms: boolean;
  suggestion?: string;
} {
  const valid =
    expectedFormat === 'assembly' ? isValidAssemblyNumber(name) : isValidPartNumber(name);
  if (valid) return { conforms: true };

  const loose = name.match(/(\d{2}[A-Z]?)[\s_-]?[AP][\s_-]?(\d{3,})/i);
  if (loose) {
    const prefix = loose[1].toUpperCase();
    const num    = loose[2];
    const type   = expectedFormat === 'assembly' ? 'A' : 'P';
    return { conforms: false, suggestion: `${prefix}_${type}_${num}` };
  }

  return { conforms: false };
}

export function getCurrentSeasonYear(): number {
  return new Date().getFullYear();
}

/** @deprecated Use projectCode() instead. */
export function getSeasonYY(): string {
  return String(getCurrentSeasonYear()).slice(-2);
}
