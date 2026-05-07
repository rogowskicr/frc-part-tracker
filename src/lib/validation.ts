/**
 * Part/Assembly number validation and generation utilities.
 *
 * Format: YY_A_NNN (assembly) or YY_P_NNN (part)
 *   YY  = last 2 digits of the season year (e.g. 26 for 2026)
 *   A/P = 'A' for assembly, 'P' for part
 *   NNN = 3+ digit sequential number
 *
 * Top-level assemblies increment by 100: 26_A_100, 26_A_200, 26_A_300
 * Sub-assemblies increment by 1 within a group: 26_A_101, 26_A_102
 * Parts start from their parent assembly number + 1: 26_P_101, 26_P_102
 */

const ASSEMBLY_REGEX = /^(\d{2})_A_(\d{3,})$/;
const PART_REGEX = /^(\d{2})_P_(\d{3,})$/;
const EITHER_REGEX = /^(\d{2})_[AP]_(\d{3,})$/;

export function isValidAssemblyNumber(value: string): boolean {
  return ASSEMBLY_REGEX.test(value);
}

export function isValidPartNumber(value: string): boolean {
  return PART_REGEX.test(value);
}

export function isValidPartOrAssemblyNumber(value: string): boolean {
  return EITHER_REGEX.test(value);
}

/**
 * Returns a user-friendly validation error message, or null if valid.
 */
export function validatePartNumber(value: string): string | null {
  if (!value) return 'Part number is required';
  if (!PART_REGEX.test(value)) {
    return 'Part number must follow the format YY_P_NNN (e.g. 26_P_101)';
  }
  return null;
}

export function validateAssemblyNumber(value: string): string | null {
  if (!value) return 'Assembly number is required';
  if (!ASSEMBLY_REGEX.test(value)) {
    return 'Assembly number must follow the format YY_A_NNN (e.g. 26_A_100)';
  }
  return null;
}

/**
 * Extract the numeric portion from a part/assembly number.
 */
export function extractNumber(partNumber: string): number | null {
  const match = partNumber.match(EITHER_REGEX);
  if (!match) return null;
  return parseInt(match[2], 10);
}

/**
 * Extract the year prefix from a part/assembly number.
 */
export function extractYear(partNumber: string): string | null {
  const match = partNumber.match(EITHER_REGEX);
  return match ? match[1] : null;
}

/**
 * Given a list of existing assembly numbers for a team+year, suggest the next
 * top-level assembly number (multiples of 100).
 */
export function nextTopLevelAssemblyNumber(year: number, existingNumbers: string[]): string {
  const yy = String(year).slice(-2);
  const nums = existingNumbers
    .filter((n) => n.startsWith(`${yy}_A_`))
    .map(extractNumber)
    .filter((n): n is number => n !== null);

  // Top-level assemblies are multiples of 100
  const topLevel = nums.filter((n) => n % 100 === 0);
  const next = topLevel.length > 0 ? Math.max(...topLevel) + 100 : 100;
  return `${yy}_A_${next}`;
}

/**
 * Given a parent assembly number and existing numbers, suggest the next part number.
 * Parts start at parentNumber+1 and increment by 1.
 */
export function nextPartNumber(parentAssemblyNumber: string, existingPartNumbers: string[]): string {
  const yy = extractYear(parentAssemblyNumber);
  const parentNum = extractNumber(parentAssemblyNumber);
  if (!yy || parentNum === null) return '';

  const partsInGroup = existingPartNumbers
    .filter((n) => n.startsWith(`${yy}_P_`))
    .map(extractNumber)
    .filter((n): n is number => n !== null && n > parentNum && n < parentNum + 100);

  const next = partsInGroup.length > 0 ? Math.max(...partsInGroup) + 1 : parentNum + 1;
  return `${yy}_P_${next}`;
}

/**
 * Given an existing assembly number and all assembly numbers for the year,
 * suggest the next sub-assembly number (increments by 1 within the 100-block).
 */
export function nextSubAssemblyNumber(parentAssemblyNumber: string, existingNumbers: string[]): string {
  const yy = extractYear(parentAssemblyNumber);
  const parentNum = extractNumber(parentAssemblyNumber);
  if (!yy || parentNum === null) return '';

  const base = Math.floor(parentNum / 100) * 100;
  const subAssemblies = existingNumbers
    .filter((n) => n.startsWith(`${yy}_A_`))
    .map(extractNumber)
    .filter((n): n is number => n !== null && n > base && n < base + 100);

  const next = subAssemblies.length > 0 ? Math.max(...subAssemblies) + 1 : base + 1;
  return `${yy}_A_${next}`;
}

/**
 * Check if a part name (from OnShape or manual entry) conforms to the naming
 * convention. Returns a suggested corrected number if it doesn't.
 */
export function checkNamingConformance(name: string, expectedFormat: 'assembly' | 'part'): {
  conforms: boolean;
  suggestion?: string;
} {
  const valid =
    expectedFormat === 'assembly' ? isValidAssemblyNumber(name) : isValidPartNumber(name);
  if (valid) return { conforms: true };

  // Try to extract year and number from a loose format
  const loose = name.match(/(\d{2})[\s_-]?[AP][\s_-]?(\d{3,})/i);
  if (loose) {
    const yy = loose[1];
    const num = loose[2];
    const type = expectedFormat === 'assembly' ? 'A' : 'P';
    return { conforms: false, suggestion: `${yy}_${type}_${num}` };
  }

  return { conforms: false };
}

export function getCurrentSeasonYear(): number {
  const now = new Date();
  // FRC season starts in January; use current year
  return now.getFullYear();
}

export function getSeasonYY(): string {
  return String(getCurrentSeasonYear()).slice(-2);
}
