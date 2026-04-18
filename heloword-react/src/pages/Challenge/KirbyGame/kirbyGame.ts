// ─── Constants ───────────────────────────────────────────────────────────────
const CANVAS_W = 960, CANVAS_H = 480;
const TILE = 80, COLS = 12, ROWS = 6;
const LS_KEY = 'hw-kirby-highscore';

// Physics
const GRAVITY     = 0.55;  // px/frame²
const MAX_FALL    = 14;    // px/frame cap
const MOVE_SPD    = 4;     // px/frame horizontal
const JUMP_VY     = -13;   // px/frame on jump
const COYOTE_F    = 8;     // frames of coyote time after leaving edge
const JUMP_BUF_F  = 8;     // frames of jump-buffer (press before landing)

// Attack
const ATK_COOL_ORIGIN = 24; // frames between origin attacks
const ATK_COOL_FIRE   = 16; // frames between fire shots
const EAT_ANIM_F      = 22; // frames eat sprite is shown
const ATK_REACH       = 110; // px in front of Kirby
const ATK_VRANGE      = 55;  // ±px vertical range

// Monster
const MON_SPD   = 1.4;  // px/frame patrol speed
const MON_RANGE = 80;   // ±px patrol range from home

// Invincibility
const INVINC_F  = 90;   // player iframes after being hit (1.5 s @ 60fps)
const BLINK_F   = 6;    // blink period (half on, half off)

// Kirby hitbox offsets from sprite top-left
const HBL = 10, HBR = 70, HBT = 8, HBB = 76;

// Tile type IDs
const T_SOLID = 1, T_PLATFORM = 2, T_LAVA = 3, T_DOOR = 4;

// ─── Maps ────────────────────────────────────────────────────────────────────
const MAPS: number[][] = [
  // Stage 1
  [ 0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,1,1,0,0,0,0,
    0,0,0,0,1,1,2,2,1,0,0,0,
    0,0,0,0,2,2,2,2,2,0,0,4,
    2,2,2,2,2,2,2,2,2,2,2,2,
    3,3,3,3,3,3,3,3,3,3,3,3 ],
  // Stage 2
  [ 0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,1,1,1,2,0,0,
    0,0,1,1,0,1,2,2,2,2,0,0,
    0,0,2,2,0,0,2,2,2,2,0,4,
    2,2,2,2,2,2,2,2,2,2,2,2,
    3,3,3,3,3,3,3,3,3,3,3,3 ],
  // Stage 3
  [ 0,0,0,0,0,0,0,0,0,0,0,0,
    0,0,0,1,0,1,1,1,0,0,1,0,
    0,1,1,2,2,2,2,2,0,1,0,0,
    0,2,2,2,2,2,2,2,2,2,0,4,
    2,2,2,2,2,2,2,2,2,2,2,2,
    3,3,3,3,3,3,3,3,3,3,3,3 ],
];

// Monster definitions per stage: sprite top-left (x,y) when standing on platform.
// y = tileRowTop - TILE (sprite sits on top of that tile row).
const STAGE_DEFS: Array<Array<{ hx: number; y: number; dir: number } | null>> = [
  //             fm1                   fm2
  [ { hx: 720, y: 160, dir: -1 }, null ],
  [ { hx: 480, y:   0, dir: -1 }, { hx: 160, y:  80, dir: 1 } ],
  [ { hx: 400, y:   0, dir: -1 }, { hx: 160, y:  80, dir: 1 } ],
];

// ─── Types ────────────────────────────────────────────────────────────────────
export type GamePhase = 'start' | 'stage-intro' | 'playing' | 'gameover' | 'win';
type KirbyState = 'origin' | 'fire';

interface Monster {
  hp: number;
  homeX: number;
  x: number;
  y: number;
  dir: number; // 1=right, -1=left
}

export type KirbyGameCallbacks = {
  onScoreChange: (s: number) => void;
  onHpChange:    (hp: number) => void;
  onPhaseChange: (p: GamePhase) => void;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function getKirbyHighScore(): number {
  return parseInt(localStorage.getItem(LS_KEY) ?? '0', 10) || 0;
}
function saveHighScore(s: number) {
  if (s > getKirbyHighScore()) localStorage.setItem(LS_KEY, String(s));
}
function loadImg(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

// ─── KirbyGame ───────────────────────────────────────────────────────────────
export class KirbyGame {
  private canvas: HTMLCanvasElement;
  private ctx:    CanvasRenderingContext2D;
  private cb:     KirbyGameCallbacks;
  private raf = 0;
  private imgs: Record<string, HTMLImageElement> = {};

  // Player
  private x = 20;       // sprite top-left x
  private y = 244;      // sprite top-left y  (feet = y+HBB = 320 → top of row-4 platform)
  private vx = 0;
  private vy = 0;
  private onGround = false;
  private coyoteFrames = 0;
  private jumpBufFrames = 0;
  private isright = true;
  private kirbyState: KirbyState = 'origin';
  private kirbyHp = 3;
  private invincFrames = 0;   // player invincibility (blink)

  // Input (raw)
  private rightHeld  = false;
  private leftHeld   = false;
  private attackHeld = false;

  // Attack state
  private atkCooldown = 0;  // frames until next attack allowed
  private eatAnimFrames = 0; // frames remaining of eat-sprite display

  // Monsters
  private monsters: (Monster | null)[] = [];

  // Game state
  private score = 0;
  private stage = 0;
  private phase: GamePhase = 'start';
  private stageIntroMs = 0;

  private keyDownH = (e: KeyboardEvent) => this.onKeyDown(e);
  private keyUpH   = (e: KeyboardEvent) => this.onKeyUp(e);

  // ── Constructor ────────────────────────────────────────────────────────────
  constructor(canvas: HTMLCanvasElement, cb: KirbyGameCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.cb  = cb;

    const b = `${import.meta.env.BASE_URL}kirby-game/`;
    const l = (n: string) => loadImg(b + n);
    Object.assign(this.imgs, {
      fly:  l('fly.png'),  flyleft:  l('flyleft.png'),
      eat:  l('eat.png'),  eatleft:  l('eatleft.png'),
      fire: l('fire.png'), fireleft: l('fireleft.png'),
      fireEffect: l('fireEffect.png'), fireEffectleft: l('fireEffectleft.png'),
      floor: l('floor.png'), air: l('air.png'), door: l('door.png'),
      lava:  l('lava.gif'),
      firemonster: l('firemonster.png'),
      gameover: l('gameover.png'),
    });

    document.addEventListener('keydown', this.keyDownH);
    document.addEventListener('keyup',   this.keyUpH);
    this.raf = requestAnimationFrame(() => this.loop());
  }

  // ── Public API (mobile buttons) ────────────────────────────────────────────
  pressRight(down: boolean)  { this.rightHeld  = down; if (down) this.isright = true; }
  pressLeft(down: boolean)   { this.leftHeld   = down; if (down) this.isright = false; }
  pressAttack(down: boolean) { this.attackHeld = down; }
  pressJump()  {
    if (this.phase === 'start' || this.phase === 'stage-intro') { this.advancePhase(); return; }
    if (this.phase !== 'playing') return;
    this.jumpBufFrames = JUMP_BUF_F; // buffer the jump
  }
  pressEnterDoor() { this.tryEnterDoor(); }

  destroy() {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('keydown', this.keyDownH);
    document.removeEventListener('keyup',   this.keyUpH);
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────
  private onKeyDown(e: KeyboardEvent) {
    if (this.phase === 'start' || this.phase === 'stage-intro') {
      if (e.code === 'Space') { e.preventDefault(); this.advancePhase(); }
      return;
    }
    if (this.phase !== 'playing') return;
    if (e.code === 'ArrowRight')                                  { e.preventDefault(); this.rightHeld  = true; this.isright = true;  }
    else if (e.code === 'ArrowLeft')                              { e.preventDefault(); this.leftHeld   = true; this.isright = false; }
    else if (e.code === 'Space')                                  { e.preventDefault(); this.jumpBufFrames = JUMP_BUF_F; }
    else if (e.code === 'ControlLeft' || e.code === 'ControlRight') { e.preventDefault(); this.attackHeld = true; }
    else if (e.code === 'ShiftLeft'   || e.code === 'ShiftRight') { this.kirbyState = 'origin'; }
    else if (e.code === 'ArrowUp')                                { e.preventDefault(); this.tryEnterDoor(); }
  }
  private onKeyUp(e: KeyboardEvent) {
    if (e.code === 'ArrowRight')                                    this.rightHeld  = false;
    else if (e.code === 'ArrowLeft')                                this.leftHeld   = false;
    else if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.attackHeld = false;
  }

  // ── Stage management ──────────────────────────────────────────────────────
  private advancePhase() {
    if (this.phase === 'start')       { this.loadStage(1); return; }
    if (this.phase === 'stage-intro') { this.phase = 'playing'; this.cb.onPhaseChange('playing'); }
  }

  private loadStage(n: number) {
    this.stage      = n;
    this.x          = 20;
    this.y          = TILE * 4 - HBB;  // feet on top of row-4 platform
    this.vx         = 0;
    this.vy         = 0;
    this.onGround   = true;
    this.coyoteFrames  = COYOTE_F;
    this.jumpBufFrames = 0;
    this.eatAnimFrames = 0;
    this.atkCooldown   = 0;
    this.invincFrames  = 0;
    this.kirbyState = 'origin';
    this.isright    = true;

    const defs = STAGE_DEFS[n - 1] ?? [];
    this.monsters = defs.map(d => d === null ? null : {
      hp: 5, homeX: d.hx, x: d.hx, y: d.y, dir: d.dir,
    });

    this.phase = 'stage-intro';
    this.stageIntroMs = Date.now();
    this.cb.onPhaseChange('stage-intro');
  }

  private tryEnterDoor() {
    if (this.phase !== 'playing') return;
    if (this.touchingDoor()) {
      this.score += 100;
      this.cb.onScoreChange(this.score);
      this.stage < 3 ? this.loadStage(this.stage + 1) : this.winGame();
    }
  }

  private winGame() {
    this.score += 200 + this.kirbyHp * 10;
    this.cb.onScoreChange(this.score);
    this.phase = 'win';
    this.cb.onPhaseChange('win');
    saveHighScore(this.score);
  }

  private gameOver() {
    this.phase = 'gameover';
    this.cb.onPhaseChange('gameover');
    saveHighScore(this.score);
  }

  // ── Tile helpers ───────────────────────────────────────────────────────────
  private map(): number[] { return MAPS[this.stage - 1] ?? MAPS[0]; }

  private tileAt(col: number, row: number): number {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return 0;
    return this.map()[row * COLS + col];
  }

  private isSolid(col: number, row: number): boolean {
    const t = this.tileAt(col, row);
    return t === T_SOLID || t === T_PLATFORM || t === T_DOOR;
  }

  private touchingDoor(): boolean {
    const c0 = Math.floor((this.x + HBL) / TILE);
    const c1 = Math.floor((this.x + HBR - 1) / TILE);
    const r0 = Math.floor((this.y + HBT) / TILE);
    const r1 = Math.floor((this.y + HBB) / TILE);
    for (let c = c0; c <= c1; c++)
      for (let r = r0; r <= r1; r++)
        if (this.tileAt(c, r) === T_DOOR) return true;
    return false;
  }

  private touchingLava(): boolean {
    const c0 = Math.floor((this.x + HBL + 4) / TILE);
    const c1 = Math.floor((this.x + HBR - 5) / TILE);
    const row = Math.floor((this.y + HBB) / TILE);
    for (let c = c0; c <= c1; c++)
      if (this.tileAt(c, row) === T_LAVA) return true;
    return false;
  }

  // ── Physics ────────────────────────────────────────────────────────────────
  private updatePhysics() {
    // Horizontal movement (instant acceleration, no slide)
    if (this.rightHeld)       this.vx =  MOVE_SPD;
    else if (this.leftHeld)   this.vx = -MOVE_SPD;
    else                      this.vx =  0;

    // Gravity
    this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);

    // Coyote time
    if (this.onGround) this.coyoteFrames = COYOTE_F;
    else if (this.coyoteFrames > 0) this.coyoteFrames--;

    // Jump from buffer
    if (this.jumpBufFrames > 0) {
      this.jumpBufFrames--;
      if (this.coyoteFrames > 0) {
        this.vy = JUMP_VY;
        this.coyoteFrames = 0;
        this.jumpBufFrames = 0;
      }
    }

    this.onGround = false;

    // ── Resolve Y ─────────────────────────────────────────────────────────
    {
      const c0 = Math.floor((this.x + HBL + 2) / TILE);
      const c1 = Math.floor((this.x + HBR - 3) / TILE);

      if (this.vy >= 0) {
        // Falling — check feet
        this.y += this.vy;
        const feetRow = Math.floor((this.y + HBB) / TILE);
        if ((this.isSolid(c0, feetRow) || this.isSolid(c1, feetRow))) {
          this.y = feetRow * TILE - HBB;
          this.vy = 0;
          this.onGround = true;
        }
      } else {
        // Rising — check head
        const newHeadRow = Math.floor((this.y + HBT + this.vy) / TILE);
        const curHeadRow = Math.floor((this.y + HBT) / TILE);
        if (newHeadRow !== curHeadRow &&
            (this.isSolid(c0, newHeadRow) || this.isSolid(c1, newHeadRow))) {
          this.y = (newHeadRow + 1) * TILE - HBT;
          this.vy = 0;
        } else {
          this.y += this.vy;
        }
      }
    }

    // ── Resolve X ─────────────────────────────────────────────────────────
    if (this.vx !== 0) {
      const r0 = Math.floor((this.y + HBT + 4) / TILE);
      const r1 = Math.floor((this.y + HBB - 5) / TILE);

      if (this.vx > 0) {
        const newRightCol = Math.floor((this.x + HBR + this.vx) / TILE);
        const curRightCol = Math.floor((this.x + HBR) / TILE);
        if (newRightCol !== curRightCol &&
            (this.isSolid(newRightCol, r0) || this.isSolid(newRightCol, r1))) {
          this.x  = newRightCol * TILE - HBR;
          this.vx = 0;
        } else {
          this.x += this.vx;
        }
      } else {
        const newLeftCol = Math.floor((this.x + HBL + this.vx) / TILE);
        const curLeftCol = Math.floor((this.x + HBL) / TILE);
        if (newLeftCol !== curLeftCol &&
            (this.isSolid(newLeftCol, r0) || this.isSolid(newLeftCol, r1))) {
          this.x  = (newLeftCol + 1) * TILE - HBL;
          this.vx = 0;
        } else {
          this.x += this.vx;
        }
      }
    }

    // Clamp to canvas bounds
    this.x = Math.max(-HBL, Math.min(CANVAS_W - HBR - 1, this.x));

    // Lava / fall-off death
    if (this.y + HBB >= CANVAS_H || this.touchingLava()) {
      this.kirbyHp = 0;
    }
  }

  // ── Attack ─────────────────────────────────────────────────────────────────
  private canHit(m: Monster): boolean {
    if (m.hp <= 0) return false;
    const reach = this.isright ? this.x + HBR : this.x + HBL;
    const atkL  = this.isright ? reach : reach - ATK_REACH;
    const atkR  = this.isright ? reach + ATK_REACH : reach;
    const atkT  = this.y + HBT - ATK_VRANGE;
    const atkB  = this.y + HBB + ATK_VRANGE;
    return m.x < atkR && m.x + TILE > atkL && m.y < atkB && m.y + TILE > atkT;
  }

  private fireAttack() {
    for (const m of this.monsters) {
      if (m && this.canHit(m)) {
        m.hp = 0;
        this.score += 50;
        this.cb.onScoreChange(this.score);
      }
    }
  }

  private originAttack() {
    for (const m of this.monsters) {
      if (m && this.canHit(m)) {
        m.hp = 0;
        this.score += 50;
        this.cb.onScoreChange(this.score);
        this.kirbyState = 'fire'; // absorb power
        this.eatAnimFrames = EAT_ANIM_F;
        return; // one at a time
      }
    }
    this.eatAnimFrames = EAT_ANIM_F; // still show eat anim even on miss
  }

  private updateAttack() {
    if (this.atkCooldown > 0) this.atkCooldown--;
    if (this.eatAnimFrames > 0) this.eatAnimFrames--;

    if (this.attackHeld && this.atkCooldown === 0) {
      if (this.kirbyState === 'origin') {
        this.originAttack();
        this.atkCooldown = ATK_COOL_ORIGIN;
      } else {
        this.fireAttack();
        this.atkCooldown = ATK_COOL_FIRE;
      }
    }
  }

  // ── Monster update ─────────────────────────────────────────────────────────
  private updateMonsters() {
    for (const m of this.monsters) {
      if (!m || m.hp <= 0) continue;
      // Patrol
      m.x += m.dir * MON_SPD;
      if (m.x > m.homeX + MON_RANGE) { m.x = m.homeX + MON_RANGE; m.dir = -1; }
      if (m.x < m.homeX - MON_RANGE) { m.x = m.homeX - MON_RANGE; m.dir =  1; }
    }
  }

  // ── Hurt detection ─────────────────────────────────────────────────────────
  private updateHurt() {
    if (this.invincFrames > 0) { this.invincFrames--; return; }
    for (const m of this.monsters) {
      if (!m || m.hp <= 0) continue;
      // AABB overlap between Kirby and monster
      const kL = this.x + HBL, kR = this.x + HBR;
      const kT = this.y + HBT, kB = this.y + HBB;
      if (kL < m.x + TILE && kR > m.x && kT < m.y + TILE && kB > m.y) {
        this.kirbyHp--;
        this.invincFrames = INVINC_F;
        this.cb.onHpChange(this.kirbyHp);
        return;
      }
    }
  }

  // ── Draw helpers ───────────────────────────────────────────────────────────
  private drawMap() {
    const map = this.map();
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const t = map[row * COLS + col];
        const x = col * TILE, y = row * TILE;
        if      (t === T_SOLID) this.ctx.drawImage(this.imgs.floor, x, y);
        else if (t === T_LAVA)  this.ctx.drawImage(this.imgs.lava,  x, y);
        else if (t === T_DOOR)  this.ctx.drawImage(this.imgs.door,  x, y);
        else                    this.ctx.drawImage(this.imgs.air,   x, y);
      }
    }
  }

  private drawMonsters() {
    const { ctx } = this;
    for (const m of this.monsters) {
      if (!m || m.hp <= 0) continue;
      if (m.dir < 0) {
        ctx.save();
        ctx.translate(m.x + TILE, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(this.imgs.firemonster, 0, m.y);
        ctx.restore();
      } else {
        ctx.drawImage(this.imgs.firemonster, m.x, m.y);
      }
    }
  }

  private drawKirby() {
    const { ctx } = this;
    // Blink during invincibility
    if (this.invincFrames > 0 && Math.floor(this.invincFrames / (BLINK_F / 2)) % 2 === 0) return;

    const showingEat = this.eatAnimFrames > 0 && this.kirbyState === 'fire';
    // While holding attack in fire state, show fire effect
    if (this.attackHeld && this.kirbyState === 'fire') {
      const eff = this.isright ? this.imgs.fireEffect : this.imgs.fireEffectleft;
      ctx.drawImage(eff, this.isright ? this.x + 60 : this.x - 60, this.y);
    }
    // Kirby sprite
    let img: HTMLImageElement;
    if (showingEat) {
      img = this.isright ? this.imgs.eat : this.imgs.eatleft;
    } else if (this.kirbyState === 'fire') {
      img = this.isright ? this.imgs.fire : this.imgs.fireleft;
    } else if (this.attackHeld) {
      img = this.isright ? this.imgs.eat : this.imgs.eatleft;
    } else {
      img = this.isright ? this.imgs.fly : this.imgs.flyleft;
    }
    ctx.drawImage(img, this.x, this.y);
  }

  private drawHUD() {
    const { ctx } = this;
    // Semi-transparent bar
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, CANVAS_W, 32);
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`Score: ${this.score}`, 10, 22);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillText(`HP: ${'♥ '.repeat(Math.max(0, this.kirbyHp))}`, CANVAS_W - 120, 22);
    ctx.fillStyle = '#ccc';
    ctx.font = '12px Arial';
    ctx.fillText(`Stage ${this.stage}/3`, CANVAS_W / 2 - 22, 22);
  }

  private drawScreen(bg: string, lines: { text: string; font: string; color: string; y: number }[]) {
    const { ctx } = this;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = 'center';
    for (const l of lines) {
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, CANVAS_W / 2, l.y);
    }
    ctx.textAlign = 'left';
  }

  private drawStartScreen() {
    this.drawScreen('#0f3460', [
      { text: '★ KIRBY ADVENTURE ★',    font: 'bold 58px Arial', color: '#ff9ff3', y: 160 },
      { text: 'Arrow keys to move',      font: '26px Arial',       color: '#dfe6e9', y: 230 },
      { text: 'SPACE to jump  ·  Ctrl to attack', font: '26px Arial', color: '#dfe6e9', y: 268 },
      { text: '↑ to enter door  ·  Shift to drop power', font: '22px Arial', color: '#b2bec3', y: 304 },
      { text: 'Press SPACE to start!',   font: 'bold 28px Arial',  color: '#fdcb6e', y: 390 },
    ]);
  }

  private drawStageIntro() {
    const elapsed = Date.now() - this.stageIntroMs;
    if (elapsed > 2200) { this.advancePhase(); return; }
    const alpha = Math.min(1, (2200 - elapsed) / 400); // fade out near end
    this.drawScreen('#1a1a2e', [
      { text: `— Stage ${this.stage} —`, font: 'bold 76px Arial', color: '#dfe6e9', y: 220 },
      { text: 'Get ready!',              font: '30px Arial',       color: '#b2bec3', y: 290 },
    ]);
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    this.ctx.globalAlpha = 1;
  }

  private drawWinScreen() {
    this.drawScreen('#16213e', [
      { text: '🎉 YOU WIN! 🎉',      font: 'bold 72px Arial', color: '#ffd700', y: 185 },
      { text: `Final Score: ${this.score}`, font: 'bold 38px Arial', color: '#ffffff', y: 270 },
      { text: `High Score: ${getKirbyHighScore()}`, font: '26px Arial', color: '#74b9ff', y: 324 },
      { text: 'High score saved!',   font: '22px Arial',       color: '#81ecec', y: 370 },
    ]);
  }

  // ── Main loop ──────────────────────────────────────────────────────────────
  private loop() {
    const { ctx } = this;

    switch (this.phase) {
      case 'start':
        this.drawStartScreen();
        break;
      case 'stage-intro':
        this.drawStageIntro();
        break;
      case 'win':
        this.drawWinScreen();
        break;
      case 'gameover':
        ctx.drawImage(this.imgs.gameover, 0, 0, CANVAS_W, CANVAS_H);
        break;
      case 'playing': {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        this.drawMap();
        this.updateMonsters();
        this.drawMonsters();
        this.updatePhysics();
        this.updateAttack();
        this.updateHurt();
        this.drawKirby();
        this.drawHUD();

        if (this.kirbyHp <= 0) this.gameOver();
        break;
      }
    }

    this.raf = requestAnimationFrame(() => this.loop());
  }
}
