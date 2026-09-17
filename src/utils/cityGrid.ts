import { CITY_GRID } from '../config/cityGrid';

/**
 * Query helpers over the pre-baked open-space bitmask.
 *
 * The city has no navmesh and raycasting 93k triangles at runtime would be
 * wasteful, so spawn placement, traffic routing and pedestrian wandering all
 * ask this grid whether a point is on open street.
 */

function decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const bits = decode(CITY_GRID.bits);
const { minX, minZ, step, cols, rows, groundY } = CITY_GRID;

export const GROUND_Y = groundY;

export const CITY_BOUNDS = {
  minX,
  minZ,
  maxX: minX + (cols - 1) * step,
  maxZ: minZ + (rows - 1) * step,
} as const;

function cellOpen(cx: number, cz: number): boolean {
  if (cx < 0 || cx >= cols || cz < 0 || cz >= rows) return false;
  const bit = cz * cols + cx;
  return (bits[bit >> 3] & (1 << (bit & 7))) !== 0;
}

export function isOpen(x: number, z: number): boolean {
  return cellOpen(Math.round((x - minX) / step), Math.round((z - minZ) / step));
}

/**
 * True when every cell within `radius` metres is open, so a car or a group of
 * pedestrians can be dropped here without clipping a wall.
 */
export function isClear(x: number, z: number, radius: number): boolean {
  const span = Math.ceil(radius / step);
  const cx = Math.round((x - minX) / step);
  const cz = Math.round((z - minZ) / step);
  for (let dx = -span; dx <= span; dx++) {
    for (let dz = -span; dz <= span; dz++) {
      if (dx * dx + dz * dz > span * span) continue;
      if (!cellOpen(cx + dx, cz + dz)) return false;
    }
  }
  return true;
}

/** Distance in metres to the nearest blocked cell, capped at `max`. */
export function clearanceAt(x: number, z: number, max = 12): number {
  const cx = Math.round((x - minX) / step);
  const cz = Math.round((z - minZ) / step);
  if (!cellOpen(cx, cz)) return 0;
  const limit = Math.ceil(max / step);
  for (let r = 1; r <= limit; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (!cellOpen(cx + dx, cz + dz)) return r * step;
      }
    }
  }
  return max;
}

/** Nearest open point to (x, z), searching outwards. Returns null if none. */
export function nearestOpen(
  x: number,
  z: number,
  minClearance = 0,
  maxSearch = 40,
): { x: number; z: number } | null {
  const cx = Math.round((x - minX) / step);
  const cz = Math.round((z - minZ) / step);
  const limit = Math.ceil(maxSearch / step);
  for (let r = 0; r <= limit; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (r > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const wx = minX + (cx + dx) * step;
        const wz = minZ + (cz + dz) * step;
        if (!cellOpen(cx + dx, cz + dz)) continue;
        if (minClearance > 0 && clearanceAt(wx, wz, minClearance + step) < minClearance) {
          continue;
        }
        return { x: wx, z: wz };
      }
    }
  }
  return null;
}

/** All open cells, cached, for random sampling by spawn managers. */
let openCellCache: { x: number; z: number }[] | null = null;

export function allOpenCells(): { x: number; z: number }[] {
  if (openCellCache) return openCellCache;
  const list: { x: number; z: number }[] = [];
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      if (cellOpen(cx, cz)) list.push({ x: minX + cx * step, z: minZ + cz * step });
    }
  }
  openCellCache = list;
  return list;
}

export interface GridBox {
  position: [number, number, number];
  halfExtents: [number, number, number];
}

/**
 * Builds wall collision straight from the street grid.
 *
 * Deriving colliders from each mesh's bounding box does not work on this city:
 * several meshes are whole blocks tens of metres across, so their boxes swallow
 * the roads beside them and cars climb invisible kerbs. The baked grid, on the
 * other hand, records exactly which 2 m cells are drivable, so every *blocked*
 * cell becomes wall instead. Adjacent blocked cells are greedily merged into
 * larger rectangles to keep the collider count low.
 *
 * @param height How tall each wall box is, in metres.
 */
export function buildCollisionBoxes(height = 40): GridBox[] {
  const used = new Uint8Array(cols * rows);
  const boxes: GridBox[] = [];

  const blocked = (cx: number, cz: number): boolean =>
    cx >= 0 && cx < cols && cz >= 0 && cz < rows && !cellOpen(cx, cz) && !used[cz * cols + cx];

  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      if (!blocked(cx, cz)) continue;

      // Grow right as far as possible, then down while the full row matches.
      let width = 1;
      while (blocked(cx + width, cz)) width++;

      let depth = 1;
      grow: while (cz + depth < rows) {
        for (let x = cx; x < cx + width; x++) {
          if (!blocked(x, cz + depth)) break grow;
        }
        depth++;
      }

      for (let z = cz; z < cz + depth; z++) {
        for (let x = cx; x < cx + width; x++) used[z * cols + x] = 1;
      }

      const halfWidth = (width * step) / 2;
      const halfDepth = (depth * step) / 2;
      boxes.push({
        position: [
          minX + cx * step - step / 2 + halfWidth,
          groundY + height / 2,
          minZ + cz * step - step / 2 + halfDepth,
        ],
        halfExtents: [halfWidth, height / 2, halfDepth],
      });
    }
  }

  return boxes;
}

/** Renders the grid to a canvas once, for the minimap background. */
export function renderGridToCanvas(pixelsPerCell = 2): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = cols * pixelsPerCell;
  canvas.height = rows * pixelsPerCell;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#15171c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#2c3038';
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      if (cellOpen(cx, cz)) {
        ctx.fillRect(cx * pixelsPerCell, cz * pixelsPerCell, pixelsPerCell, pixelsPerCell);
      }
    }
  }
  return canvas;
}
