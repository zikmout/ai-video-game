import { GameConfig } from '@/config/gameConfig';

/**
 * Semantic actions the game reacts to. Systems query actions, never raw keys,
 * so rebinding is a matter of changing the key map below.
 */
export type InputAction =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'sprint'
  | 'jump'
  | 'interact'
  | 'weapon1'
  | 'weapon2'
  | 'weapon3'
  | 'holster'
  | 'radio'
  | 'pause';

const DEFAULT_BINDINGS: Record<string, InputAction> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Space: 'jump',
  KeyE: 'interact',
  KeyF: 'interact',
  Digit1: 'weapon1',
  Digit2: 'weapon2',
  Digit3: 'weapon3',
  Digit0: 'holster',
  KeyH: 'holster',
  KeyR: 'radio',
  Escape: 'pause',
};

/**
 * Input aggregates keyboard and pointer (mouse) state.
 *
 * - Keyboard: held-down actions via `isDown`, plus edge detection via
 *   `wasPressed` (true only on the frame the key went down).
 * - Pointer: relative look deltas accumulated between frames, using Pointer Lock
 *   so the mouse can drive a third-person camera.
 *
 * Call `endFrame()` once per frame (after systems have read input) to reset
 * per-frame accumulators and edges.
 */
export class Input {
  private readonly bindings: Record<string, InputAction>;
  private readonly down = new Set<InputAction>();
  private readonly pressedThisFrame = new Set<InputAction>();

  /** Accumulated pointer movement since the last `endFrame()` (device pixels). */
  public lookDeltaX = 0;
  public lookDeltaY = 0;
  public pointerLocked = false;

  /** Left mouse button held down / pressed this frame (fire control). */
  private fireHeld = false;
  private firePressedFrame = false;

  private disposers: Array<() => void> = [];

  constructor(
    private readonly element: HTMLElement,
    bindings: Record<string, InputAction> = DEFAULT_BINDINGS,
  ) {
    this.bindings = bindings;
  }

  attach(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = this.bindings[e.code];
      if (!action) return;
      // Prevent page scroll on space / arrows while playing.
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.down.has(action)) this.pressedThisFrame.add(action);
      this.down.add(action);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const action = this.bindings[e.code];
      if (action) this.down.delete(action);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!this.pointerLocked) return;
      this.lookDeltaX += e.movementX;
      this.lookDeltaY += e.movementY;
    };
    const onMouseDown = (e: MouseEvent) => {
      // Only treat clicks as fire while the pointer is captured (in gameplay).
      if (!this.pointerLocked || e.button !== 0) return;
      if (!this.fireHeld) this.firePressedFrame = true;
      this.fireHeld = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) this.fireHeld = false;
    };
    const onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.element;
      if (!this.pointerLocked) {
        // Dropping lock (e.g. Esc) shouldn't leave keys stuck down.
        this.down.clear();
      }
    };
    const onBlur = () => this.down.clear();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('blur', onBlur);

    this.disposers = [
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => document.removeEventListener('mousemove', onMouseMove),
      () => document.removeEventListener('mousedown', onMouseDown),
      () => document.removeEventListener('mouseup', onMouseUp),
      () => document.removeEventListener('pointerlockchange', onPointerLockChange),
      () => window.removeEventListener('blur', onBlur),
    ];
  }

  /** True while the fire button is held (automatic weapons). */
  isFireDown(): boolean {
    return this.fireHeld;
  }

  /** True only on the frame the fire button went down (semi-auto weapons). */
  wasFirePressed(): boolean {
    return this.firePressedFrame;
  }

  /** Request pointer lock so mouse movement drives the camera. */
  requestPointerLock(): void {
    // May reject without a user gesture (or in headless); ignore failures.
    const result = this.element.requestPointerLock() as unknown;
    if (result instanceof Promise) result.catch(() => undefined);
  }

  exitPointerLock(): void {
    if (document.pointerLockElement === this.element) document.exitPointerLock();
  }

  isDown(action: InputAction): boolean {
    return this.down.has(action);
  }

  wasPressed(action: InputAction): boolean {
    return this.pressedThisFrame.has(action);
  }

  /**
   * Movement input as a 2D vector: x = right(+)/left(-), y = forward(+)/back(-).
   * Not normalised here so callers can normalise per their needs.
   */
  getMoveAxis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.isDown('right')) x += 1;
    if (this.isDown('left')) x -= 1;
    if (this.isDown('forward')) y += 1;
    if (this.isDown('back')) y -= 1;
    return { x, y };
  }

  /** Look delta scaled by configured sensitivity (radians). */
  consumeLook(): { yaw: number; pitch: number } {
    const yaw = -this.lookDeltaX * GameConfig.camera.lookSensitivity;
    const pitch = -this.lookDeltaY * GameConfig.camera.lookSensitivity;
    return { yaw, pitch };
  }

  /** Reset per-frame state. Call once at the end of each frame. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.firePressedFrame = false;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.down.clear();
    this.pressedThisFrame.clear();
  }
}
