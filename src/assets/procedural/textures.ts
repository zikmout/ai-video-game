import * as THREE from 'three';

/**
 * Procedural, tileable textures drawn on a canvas.
 *
 * These are the "placeholder" providers described in docs/AI_ASSETS.md: cheap,
 * offline, and good enough to read the world clearly. They are authored to tile
 * seamlessly (wrapping noise, edge-safe patterns) so large surfaces don't show
 * obvious seams — the recurring complaint in the source experiment.
 *
 * Later, an AI texture provider can return richer `THREE.Texture`s through the
 * same shapes without callers changing.
 */

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return { canvas, ctx };
}

/**
 * Add per-pixel grain to the RGB channels. `amount` is the peak +/- deviation
 * applied to each channel. Alpha is left fully opaque — these are surface
 * textures, not decals.
 */
function addNoise(ctx: CanvasRenderingContext2D, size: number, amount: number): void {
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    data[i] = clampByte(data[i]! + n);
    data[i + 1] = clampByte(data[i + 1]! + n);
    data[i + 2] = clampByte(data[i + 2]! + n);
    // Alpha (data[i + 3]) stays at its opaque default.
  }
  ctx.putImageData(image, 0, 0);
}

const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

function finalize(
  canvas: HTMLCanvasElement,
  repeat: number,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  tex.colorSpace = colorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Asphalt road surface with faint lane grain. */
export function makeAsphaltTexture(repeat = 24): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#3a3d42';
  ctx.fillRect(0, 0, size, size);
  addNoise(ctx, size, 34);
  return finalize(canvas, repeat);
}

/** Concrete sidewalk with a subtle slab grid that tiles. */
export function makeSidewalkTexture(repeat = 20): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#8b8d86';
  ctx.fillRect(0, 0, size, size);
  addNoise(ctx, size, 22);
  ctx.strokeStyle = 'rgba(60,60,60,0.35)';
  ctx.lineWidth = 2;
  const cells = 4;
  const step = size / cells;
  for (let i = 0; i <= cells; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  return finalize(canvas, repeat);
}

/** Ground / dirt-grass blend for parks and outskirts. */
export function makeGroundTexture(repeat = 40): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#5c7a44';
  ctx.fillRect(0, 0, size, size);
  // Blotches of lighter/darker green that wrap.
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * 10;
    const shade = Math.random() > 0.5 ? 'rgba(90,120,60,0.25)' : 'rgba(60,85,40,0.25)';
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  addNoise(ctx, size, 18);
  return finalize(canvas, repeat);
}

/** A façade texture: windows in a grid, tinted per building. */
export function makeFacadeTexture(
  baseColor: string,
  windowColor: string,
  floors: number,
  columns: number,
): THREE.CanvasTexture {
  const cell = 32;
  const size = 512;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  const marginX = cell * 0.28;
  const marginY = cell * 0.24;
  const cols = Math.max(2, columns);
  const rows = Math.max(3, Math.min(floors, size / cell));
  const cw = size / cols;
  const ch = size / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Randomly lit windows for a bit of life.
      const lit = Math.random() > 0.35;
      ctx.fillStyle = lit ? windowColor : 'rgba(20,24,30,0.85)';
      ctx.fillRect(
        c * cw + marginX,
        r * ch + marginY,
        cw - marginX * 2,
        ch - marginY * 2,
      );
    }
  }
  addNoise(ctx, size, 10);
  const tex = finalize(canvas, 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
