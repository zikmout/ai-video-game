import * as THREE from 'three';
import type { World } from '@/world/World';
import type { Vehicle } from '@/entities/Vehicle';
import { GameConfig } from '@/config/gameConfig';

/**
 * A top-down mini-map rendered on a 2D canvas.
 *
 * It draws a static base layer once (roads + building footprints, which never
 * change) into an offscreen canvas, then each frame blits that base and paints
 * the moving blips (traffic, player) on top — cheap even with many entities. The
 * view is centred on the player and rotated so "up" is where they face.
 */
export class MiniMap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base: HTMLCanvasElement;
  private readonly baseCtx: CanvasRenderingContext2D;

  private readonly size = 180;
  private readonly worldRadius = 70; // world metres shown from centre to edge
  private readonly worldSize: number;

  constructor(root: HTMLElement, private readonly world: World) {
    this.worldSize = world.city.bounds.size;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    // Offscreen base holds the whole city at a fixed resolution.
    this.base = document.createElement('canvas');
    this.base.width = 512;
    this.base.height = 512;
    this.baseCtx = this.base.getContext('2d')!;
    this.drawBase();
  }

  /** World XZ → base-canvas pixel. */
  private worldToBase(x: number, z: number): [number, number] {
    const s = this.base.width / this.worldSize;
    return [(x + this.worldSize / 2) * s, (z + this.worldSize / 2) * s];
  }

  private drawBase(): void {
    const ctx = this.baseCtx;
    const { blocks, blockSize, roadWidth } = GameConfig.city;
    const cell = blockSize + roadWidth;
    const half = this.world.city.bounds.half;
    const s = this.base.width / this.worldSize;

    // Ground.
    ctx.fillStyle = '#26331f';
    ctx.fillRect(0, 0, this.base.width, this.base.height);

    // Roads (grid lines).
    ctx.strokeStyle = '#3c4048';
    ctx.lineWidth = roadWidth * s;
    for (let i = 0; i <= blocks; i++) {
      const coord = -half + i * cell - roadWidth / 2;
      const [px] = this.worldToBase(coord, 0);
      const [, pz] = this.worldToBase(0, coord);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, this.base.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pz);
      ctx.lineTo(this.base.width, pz);
      ctx.stroke();
    }

    // Building footprints.
    ctx.fillStyle = '#5a6472';
    for (const box of this.world.buildingBoxes) {
      const [x0, z0] = this.worldToBase(box.min.x, box.min.z);
      const [x1, z1] = this.worldToBase(box.max.x, box.max.z);
      ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
    }
  }

  /**
   * Redraw the mini-map centred/rotated on the player.
   * @param playerPos world position to centre on
   * @param heading   yaw the player/car faces (radians); map rotates so it's up
   * @param vehicles  cars to plot as blips
   */
  render(playerPos: THREE.Vector3, heading: number, vehicles: readonly Vehicle[]): void {
    const ctx = this.ctx;
    const r = this.size / 2;
    const scale = r / this.worldRadius; // base-metres → minimap pixels

    ctx.save();
    // Circular clip.
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.clearRect(0, 0, this.size, this.size);

    // Rotate so the player's heading points up, translate to centre on them.
    ctx.translate(r, r);
    ctx.rotate(-heading);
    const baseScale = scale * (this.worldSize / this.base.width);
    ctx.scale(baseScale, baseScale);
    const [px, pz] = this.worldToBase(playerPos.x, playerPos.z);
    ctx.translate(-px, -pz);
    ctx.drawImage(this.base, 0, 0);

    // Vehicle blips.
    for (const v of vehicles) {
      const [bx, bz] = this.worldToBase(v.position.x, v.position.z);
      ctx.fillStyle = v.occupied ? '#35d0a5' : '#ffd24a';
      ctx.beginPath();
      ctx.arc(bx, bz, 6 / baseScale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Player marker: a triangle at centre pointing up.
    ctx.save();
    ctx.translate(r, r);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Border ring.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r, r, r - 1, 0, Math.PI * 2);
    ctx.stroke();
  }
}
