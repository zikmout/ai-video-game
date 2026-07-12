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
  private clockEl!: HTMLDivElement;
  private moneyEl!: HTMLDivElement;
  private minimapRoot!: HTMLDivElement;
  private starsEl!: HTMLDivElement;
  private weaponEl!: HTMLDivElement;
  private phoneEl!: HTMLDivElement;
  private objectiveEl!: HTMLDivElement;
  private objectiveTextEl!: HTMLSpanElement;
  private objectiveDistEl!: HTMLSpanElement;
  private bannerEl!: HTMLDivElement;
  private radioEl!: HTMLDivElement;
  private bannerTimer: number | undefined;
  private radioTimer: number | undefined;

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
        <div class="clock-time">09:00</div>
        <div class="money">$0</div>
      </div>
      <span class="fps">-- fps</span>
      <div class="stars"></div>
      <div class="reticle"></div>
      <div class="prompt" style="display:none"></div>
      <div class="weapon" style="display:none"></div>
      <div class="speedo" style="display:none">
        <span class="kmh">0</span><span class="unit">km/h</span>
      </div>
      <div class="radio-label" style="display:none"></div>
      <div class="objective" style="display:none">
        <span class="objective-text"></span>
        <span class="objective-dist"></span>
      </div>
      <div class="phonecall" style="display:none">
        <div class="phone-icon">📞</div>
        <div class="phone-body">
          <div class="phone-caller"></div>
          <div class="phone-lines"></div>
        </div>
      </div>
      <div class="banner" style="display:none"></div>
      <div class="minimap-wrap"></div>`;
    this.hud.style.display = 'none';
    root.appendChild(this.hud);

    this.fpsEl = this.hud.querySelector('.fps') as HTMLSpanElement;
    this.promptEl = this.hud.querySelector('.prompt') as HTMLDivElement;
    this.speedoEl = this.hud.querySelector('.speedo') as HTMLDivElement;
    this.kmhEl = this.hud.querySelector('.kmh') as HTMLSpanElement;
    this.reticleEl = this.hud.querySelector('.reticle') as HTMLDivElement;
    this.clockEl = this.hud.querySelector('.clock-time') as HTMLDivElement;
    this.moneyEl = this.hud.querySelector('.money') as HTMLDivElement;
    this.minimapRoot = this.hud.querySelector('.minimap-wrap') as HTMLDivElement;
    this.starsEl = this.hud.querySelector('.stars') as HTMLDivElement;
    this.weaponEl = this.hud.querySelector('.weapon') as HTMLDivElement;
    this.phoneEl = this.hud.querySelector('.phonecall') as HTMLDivElement;
    this.objectiveEl = this.hud.querySelector('.objective') as HTMLDivElement;
    this.objectiveTextEl = this.hud.querySelector('.objective-text') as HTMLSpanElement;
    this.objectiveDistEl = this.hud.querySelector('.objective-dist') as HTMLSpanElement;
    this.bannerEl = this.hud.querySelector('.banner') as HTMLDivElement;
    this.radioEl = this.hud.querySelector('.radio-label') as HTMLDivElement;
    this.hintEl = this.overlay.querySelector('.menu-card') as HTMLDivElement;
    this.setStars(0);
  }

  /** Wanted level, 0..5 — filled vs hollow stars, hidden when clean. */
  setStars(level: number): void {
    if (level <= 0) {
      this.starsEl.style.display = 'none';
      return;
    }
    this.starsEl.style.display = 'block';
    let html = '';
    for (let i = 0; i < 5; i++) {
      html += `<span class="${i < level ? 'on' : 'off'}">★</span>`;
    }
    this.starsEl.innerHTML = html;
  }

  /** Equipped weapon label; null hides it. */
  setWeapon(name: string | null): void {
    if (!name) {
      this.weaponEl.style.display = 'none';
      return;
    }
    this.weaponEl.style.display = 'block';
    this.weaponEl.textContent = name;
  }

  /** Incoming phone call dialog (mission dialogue). */
  showPhoneCall(caller: string, lines: string[]): void {
    (this.phoneEl.querySelector('.phone-caller') as HTMLElement).textContent = caller;
    (this.phoneEl.querySelector('.phone-lines') as HTMLElement).innerHTML = lines
      .map((l) => `<p>${l}</p>`)
      .join('');
    this.phoneEl.style.display = 'flex';
  }

  hidePhoneCall(): void {
    this.phoneEl.style.display = 'none';
  }

  /** Current mission objective line; null hides it. */
  setObjective(text: string | null): void {
    if (!text) {
      this.objectiveEl.style.display = 'none';
      return;
    }
    this.objectiveTextEl.textContent = text;
    this.objectiveEl.style.display = 'block';
  }

  /** Distance to the objective target in metres; null hides the readout. */
  setObjectiveDistance(metres: number | null): void {
    this.objectiveDistEl.textContent = metres === null ? '' : ` — ${Math.round(metres)} m`;
  }

  /** Big centre banner (mission complete/failed); hides itself after a beat. */
  showBanner(text: string, kind: 'success' | 'fail'): void {
    this.bannerEl.textContent = text;
    this.bannerEl.className = `banner ${kind}`;
    this.bannerEl.style.display = 'block';
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => {
      this.bannerEl.style.display = 'none';
    }, 4500);
  }

  /** Radio station toast next to the speedometer; null means "radio off". */
  setRadio(station: string | null): void {
    this.radioEl.textContent = station ? `📻 ${station}` : '📻 Radio coupée';
    this.radioEl.style.display = 'block';
    window.clearTimeout(this.radioTimer);
    this.radioTimer = window.setTimeout(() => {
      this.radioEl.style.display = 'none';
    }, 2500);
  }

  /** Container the MiniMap canvas should mount into. */
  getMinimapRoot(): HTMLElement {
    return this.minimapRoot;
  }

  setClock(text: string): void {
    this.clockEl.textContent = text;
  }

  setMoney(amount: number): void {
    this.moneyEl.textContent = `$${amount.toLocaleString('en-US')}`;
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
