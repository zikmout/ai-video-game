/**
 * District zoning.
 *
 * The city grid is partitioned into districts so it reads as a place rather than
 * a uniform block field. Zoning is a pure function of a block's grid coordinates
 * and the grid size, so it is deterministic and cheap. Each district tunes how a
 * block is built (building height/colour, ground type, prop density).
 */
export type District = 'downtown' | 'residential' | 'park' | 'beach';

export interface DistrictStyle {
  /** Multiplier applied to building floor count. */
  heightScale: number;
  /** Probability a block is left open (no building) — plazas, greens. */
  openChance: number;
  /** Ground surface used for open blocks. */
  openGround: 'grass' | 'sand' | 'plaza';
  /** Building colour palette (hex strings). */
  palette: string[];
  /** Relative density of scattered props on this block (0..1). */
  propDensity: number;
}

export const DISTRICT_STYLES: Record<District, DistrictStyle> = {
  downtown: {
    heightScale: 1.6,
    openChance: 0.08,
    openGround: 'plaza',
    palette: ['#8fa1b3', '#a9b7c6', '#7f8ea0', '#b0bcc9', '#6f7d8c'],
    propDensity: 0.5,
  },
  residential: {
    heightScale: 0.7,
    openChance: 0.18,
    openGround: 'grass',
    palette: ['#d8c8b8', '#cdb9a3', '#c8c2b6', '#b7a99a', '#e0d2bf'],
    propDensity: 0.6,
  },
  park: {
    heightScale: 0.4,
    openChance: 0.8,
    openGround: 'grass',
    palette: ['#9fb0a4', '#b7a99a'],
    propDensity: 1,
  },
  beach: {
    heightScale: 0.6,
    openChance: 0.55,
    openGround: 'sand',
    palette: ['#e6dcc8', '#dcd0bb', '#cbb79c'],
    propDensity: 0.9,
  },
};

/**
 * Assign a district to a block at grid coords (bx, bz) within a `blocks`×`blocks`
 * grid. Layout: a beach strip along one edge, a park patch, a dense downtown
 * core, and residential filling the rest.
 */
export function districtAt(bx: number, bz: number, blocks: number): District {
  const last = blocks - 1;
  const cx = (blocks - 1) / 2;
  const cz = (blocks - 1) / 2;

  // Beach along the far +Z edge.
  if (bz >= last) return 'beach';

  // A park patch offset from centre.
  const parkX = Math.floor(blocks * 0.25);
  const parkZ = Math.floor(blocks * 0.3);
  if (Math.abs(bx - parkX) <= 0 && Math.abs(bz - parkZ) <= 0) return 'park';
  if (Math.abs(bx - parkX) + Math.abs(bz - parkZ) <= 1 && (bx + bz) % 3 === 0) return 'park';

  // Downtown core: central blocks (Chebyshev distance).
  const coreRadius = Math.max(1, Math.floor(blocks * 0.22));
  if (Math.max(Math.abs(bx - cx), Math.abs(bz - cz)) <= coreRadius) return 'downtown';

  return 'residential';
}
