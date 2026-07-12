/**
 * HUD builds and updates the in-game overlay: a start menu, a heads-up display
 * (clock, FPS, reticle) and pause handling. It's plain DOM — fast, accessible
 * and independent from the render loop. The HUD emits intent via callbacks so
 * the Game decides what to do (start/pause/resume).
 */
export interface HUDCallbacks {
  onPlay: () => void;
}

export class HUD {
  private readonly overlay: HTMLDivElement;
  private readonly hud: HTMLDivElement;
  private readonly fpsEl: HTMLSpanElement;
  private readonly hintEl: HTMLDivElement;
  private promptEl!: HTMLDivElement;
  private speedoEl!: HTMLDivElement;
  private kmhEl!: HTMLSpanElement;
  private reticleEl!: HTMLDivElement;

  constructor(root: HTMLElement, callbacks: HUDCallbacks) {
    // Start / pause menu overlay.
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    this.overlay.innerHTML = `
      <div class="menu-card">
        <h1 class="title">Los Asetinos</h1>
        <p class="subtitle">Bienvenue au paradis.</p>
        <button class="btn" type="button">▶ Jouer</button>
        <div class="controls-hint">
          <kbd>Z</kbd>/<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> pour se déplacer ·
          <kbd>Maj</kbd> sprint · <kbd>Espace</kbd> saut<br />
          Souris pour regarder · <kbd>Échap</kbd> pour mettre en pause
        </div>
      </div>`;
    root.appendChild(this.overlay);

    const btn = this.overlay.querySelector('.btn') as HTMLButtonElement;
    btn.addEventListener('click', () => callbacks.onPlay());

    // In-game HUD.
    this.hud = document.createElement('div');
    this.hud.className = 'hud';
    this.hud.innerHTML = `
      <div class="top-left">
        <div class="label">Los Asetinos</div>
        <div class="clock">M2 · Véhicules</div>
      </div>
      <span class="fps">-- fps</span>
      <div class="reticle"></div>
      <div class="prompt" style="display:none"></div>
      <div class="speedo" style="display:none">
        <span class="kmh">0</span><span class="unit">km/h</span>
      </div>`;
    this.hud.style.display = 'none';
    root.appendChild(this.hud);

    this.fpsEl = this.hud.querySelector('.fps') as HTMLSpanElement;
    this.promptEl = this.hud.querySelector('.prompt') as HTMLDivElement;
    this.speedoEl = this.hud.querySelector('.speedo') as HTMLDivElement;
    this.kmhEl = this.hud.querySelector('.kmh') as HTMLSpanElement;
    this.reticleEl = this.hud.querySelector('.reticle') as HTMLDivElement;
    this.hintEl = this.overlay.querySelector('.menu-card') as HTMLDivElement;
  }

  showMenu(paused = false): void {
    this.overlay.classList.remove('hidden');
    const title = this.hintEl.querySelector('.title') as HTMLElement;
    const btn = this.hintEl.querySelector('.btn') as HTMLElement;
    const subtitle = this.hintEl.querySelector('.subtitle') as HTMLElement;
    if (paused) {
      title.textContent = 'Pause';
      subtitle.textContent = 'Le paradis vous attend.';
      btn.textContent = '▶ Reprendre';
    } else {
      title.textContent = 'Los Asetinos';
      subtitle.textContent = 'Bienvenue au paradis.';
      btn.textContent = '▶ Jouer';
    }
  }

  hideMenu(): void {
    this.overlay.classList.add('hidden');
  }

  showHUD(): void {
    this.hud.style.display = 'block';
  }

  setFps(fps: number): void {
    this.fpsEl.textContent = `${Math.round(fps)} fps`;
  }

  /** Show/hide a contextual prompt (e.g. "E — Monter"). Empty hides it. */
  setPrompt(text: string): void {
    if (text) {
      this.promptEl.textContent = text;
      this.promptEl.style.display = 'block';
    } else {
      this.promptEl.style.display = 'none';
    }
  }

  /** Switch HUD between on-foot (reticle) and driving (speedometer). */
  setDriving(driving: boolean): void {
    this.speedoEl.style.display = driving ? 'flex' : 'none';
    this.reticleEl.style.display = driving ? 'none' : 'block';
  }

  /** Update the speedometer. `speed` in m/s; displayed as km/h. */
  setSpeed(speed: number): void {
    this.kmhEl.textContent = String(Math.round(Math.abs(speed) * 3.6));
  }
}
