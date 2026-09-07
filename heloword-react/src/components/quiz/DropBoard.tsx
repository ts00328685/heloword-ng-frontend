import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sentence } from '../../models';
import { meaningText, pickDecoys, promptText, shuffle, wordKey } from './boardUtils';

/**
 * 單字下樓梯 — a falling-platformer review mode modelled on 小朋友下樓梯.
 *
 * The player falls continuously while platforms scroll up. Word platforms are
 * the objectives: overlap the one whose word matches the prompt. Unlabelled
 * platforms are terrain — landing on one stops your fall and carries you toward
 * the ceiling spikes, which is the whole source of time pressure.
 *
 * Scoring stays consistent with the other board modes: a word is reviewed only
 * if it was never missed. Crucially, only landing on a WRONG WORD marks a word
 * failed — spike and hazard damage costs HP but never touches the review record,
 * so clumsy thumbs can't corrupt the spaced-repetition data.
 */

// ── Tuning ──────────────────────────────────────────────────────────────────
const CHAR_SIZE = 28;
const GRAVITY = 750;       // px/s²
const VY_MAX = 160;        // terminal fall speed
const SPIKE_H = 20;
const PLAT_H = 26;
const BAND_GAP = 136;      // vertical distance between platform rows
const SCROLL_BASE = 37;    // px/s at the start of a round
const SCROLL_STEP = 3.5;   // px/s added per cleared word
const SCROLL_MAX = 84;
const SPRING_VY = -220;
const CONVEYOR_V = 48;
const CRUMBLE_MS = 550;
const INVULN_MS = 900;
const BOUNCE_VY = -140;    // knock-back after a wrong word
const MAX_HP = 5;
const STEER_TAU = 0.055;   // horizontal easing time constant
const ANCHOR_RATIO = 0.42; // screen height the camera holds the player at while falling
const LABEL_PAD = 22;      // horizontal breathing room around a word label

type PlatKind = 'word' | 'normal' | 'conveyor' | 'crumble' | 'spring';

interface Plat {
  id: number;
  x: number;
  /** World-space y. Screen position is `wy - worldY`. */
  wy: number;
  w: number;
  kind: PlatKind;
  word?: Sentence;
  dir?: number;        // conveyor direction, -1 | 1
  crumbleAt?: number;  // ms timestamp the crumble started
  dead?: boolean;
}

interface Props {
  words: Sentence[];
  pool: Sentence[];
  onComplete: (failed: Map<string, number>) => void;
  setIndex: number;
  /** Total rounds. Omitted in free-play, where rounds are endless. */
  setTotal?: number;
  onPronounce?: (word: Sentence) => void;
  /** Free-play: roll straight into the next round on a clear instead of
   *  waiting for a tap. A run that ends in defeat always waits. */
  autoAdvanceOnClear?: boolean;
  /** Carry a combo streak in from the previous round, and report it back out,
   *  so consecutive rounds read as one continuous run. */
  initialCombo?: number;
  onComboChange?: (combo: number) => void;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const DropBoard: React.FC<Props> = ({
  words, pool, onComplete, setIndex, setTotal, onPronounce,
  autoAdvanceOnClear = false, initialCombo = 0, onComboChange,
}) => {
  const { t, i18n } = useTranslation();

  const areaRef = useRef<HTMLDivElement>(null);
  const charRef = useRef<HTMLDivElement>(null);
  // Character rig — limbs are posed procedurally each frame from the player's
  // own horizontal speed and whether they're airborne.
  const leanRef = useRef<SVGGElement>(null);
  const armLRef = useRef<SVGLineElement>(null);
  const armRRef = useRef<SVGLineElement>(null);
  const legLRef = useRef<SVGLineElement>(null);
  const legRRef = useRef<SVGLineElement>(null);
  const nodesRef = useRef<Record<number, HTMLDivElement | null>>({});
  const platsRef = useRef<Plat[]>([]);
  const rafRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const nextIdRef = useRef(1);

  // Re-render only when platforms are added or removed; positions are written
  // straight to the DOM every frame instead of going through React.
  const [, setVersion] = useState(0);

  // HUD mirrors of the game state — updated on events, never per frame.
  const [hp, setHp] = useState(MAX_HP);
  const [combo, setCombo] = useState(initialCombo);
  const [remaining, setRemaining] = useState(words.length);
  const [promptWord, setPromptWord] = useState<Sentence | null>(null);
  const [phase, setPhase] = useState<'playing' | 'cleared' | 'over'>('playing');
  const [damageFlash, setDamageFlash] = useState(false);

  const gRef = useRef({
    W: 0, H: 0,
    x: 0, py: 0, vy: 0, targetX: 0, worldY: 0, prevX: 0, phase: 0,
    standing: null as number | null,
    hp: MAX_HP,
    combo: initialCombo,
    invulnUntil: 0,
    clearedCount: 0,
    failed: new Map<string, number>(),
    queue: [] as string[],
    bandsSinceCorrect: 0,
    last: 0,
    running: false,
  });

  // The rAF loop closes over its deps, so route the callback through a ref to
  // avoid reporting into a stale handler.
  const onComboChangeRef = useRef(onComboChange);
  onComboChangeRef.current = onComboChange;
  // Only the mount-time combo seeds a round; the board remounts per round.
  const initialComboRef = useRef(initialCombo);

  /** Single funnel for combo writes so the HUD and the caller never disagree. */
  const pushCombo = useCallback((n: number) => {
    gRef.current.combo = n;
    setCombo(n);
    onComboChangeRef.current?.(n);
  }, []);

  const byKeyRef = useRef(new Map<string, Sentence>());
  // Word platforms are sized to their label. The width also *is* the hitbox, so
  // it has to be measured rather than left to CSS auto — otherwise the collision
  // box and the thing the player can see would drift apart.
  const measureRef = useRef<CanvasRenderingContext2D | null>(null);

  const wordPlatWidth = useCallback((text: string) => {
    const g = gRef.current;
    const min = 42;
    const max = Math.min(g.W * 0.72, 190);
    const ctx = measureRef.current;
    // Rough per-character fallback if the 2D context is unavailable.
    const textW = ctx ? ctx.measureText(text).width : text.length * 7;
    return clamp(Math.ceil(textW) + LABEL_PAD, min, max);
  }, []);
  const distractorsRef = useRef<Sentence[]>([]);

  /** Grow the shaft into whatever room is left under it, capped at 80% of the
   *  viewport, so the play area reaches the thumb with no dead margin below. */
  const sizeShaft = useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    const top = area.getBoundingClientRect().top;
    const vh = window.innerHeight;
    const h = Math.max(300, Math.min(vh * 0.8, vh - top - 26));
    area.style.height = `${Math.round(h)}px`;
  }, []);

  const loopDeps = useRef({ finish: (() => {}) as () => void, spawnBand: (_y: number) => {}, onPronounce, autoAdvanceOnClear });

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    const g = gRef.current;
    g.running = false;
    // Anything still in the queue was never cleared. It must be reported as
    // failed so it requeues — otherwise commitBoardRound reads "0 wrong" and
    // saves a word the learner never actually answered.
    g.queue.forEach((k) => g.failed.set(k, (g.failed.get(k) ?? 0) + 1));
    onComplete(new Map(g.failed));
  }, [onComplete]);

  // ── Spawning ──────────────────────────────────────────────────────────────

  const spawnBand = useCallback((atWorldY: number) => {
    const g = gRef.current;
    const plainW = clamp(g.W * 0.24, 64, 104);

    const count = 1 + (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.16 ? 1 : 0);

    // The prompt's platform has to show up often enough that the player is
    // never left drifting into the spikes with nothing to aim at.
    const promptKey = g.queue[0];
    const mustPlace = g.bandsSinceCorrect >= 2;
    const placeCorrect = !!promptKey && (mustPlace || Math.random() < 0.55);
    const correctSlot = placeCorrect ? Math.floor(Math.random() * count) : -1;

    const kinds: Plat[] = [];
    for (let i = 0; i < count; i++) {
      if (i === correctSlot) {
        const cw = byKeyRef.current.get(promptKey);
        kinds.push({ id: 0, x: 0, wy: atWorldY, w: wordPlatWidth(cw ? promptText(cw) : ''), kind: 'word', word: cw });
      } else if (Math.random() < 0.42) {
        const others = distractorsRef.current.filter((w) => wordKey(w) !== promptKey);
        const w = others[Math.floor(Math.random() * others.length)];
        kinds.push({ id: 0, x: 0, wy: atWorldY, w: wordPlatWidth(promptText(w)), kind: 'word', word: w });
      } else {
        const roll = Math.random();
        const kind: PlatKind = roll < 0.4 ? 'normal' : roll < 0.66 ? 'crumble' : roll < 0.87 ? 'conveyor' : 'spring';
        kinds.push({ id: 0, x: 0, wy: atWorldY, w: plainW, kind, dir: Math.random() < 0.5 ? -1 : 1 });
      }
    }

    // A row of long words can now overflow the shaft, so shed platforms until
    // the band fits — never the correct one, which must stay reachable.
    const fits = () => kinds.reduce((sum, p) => sum + p.w, 0) + (kinds.length + 1) * 6 <= g.W;
    while (!fits() && kinds.length > 1) {
      const victim = kinds.findIndex((p) => p.word !== byKeyRef.current.get(promptKey));
      kinds.splice(victim >= 0 ? victim : kinds.length - 1, 1);
    }

    // Lay the row out left to right with the slack distributed randomly, so
    // platforms never overlap but the spacing still looks irregular.
    const total = kinds.reduce((s, p) => s + p.w, 0);
    const slack = Math.max(0, g.W - total);
    const gaps: number[] = [];
    for (let i = 0; i <= kinds.length; i++) gaps.push(Math.random());
    const gapSum = gaps.reduce((a, b) => a + b, 0) || 1;
    let cursor = 0;
    kinds.forEach((p, i) => {
      cursor += (gaps[i] / gapSum) * slack;
      p.x = cursor;
      p.id = nextIdRef.current++;
      cursor += p.w;
    });

    if (placeCorrect) g.bandsSinceCorrect = 0;
    else g.bandsSinceCorrect++;

    platsRef.current.push(...shuffle(kinds));
    setVersion((v) => v + 1);
  }, [wordPlatWidth]);

  // ── Setup ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    sizeShaft();
    const rect = area.getBoundingClientRect();
    const g = gRef.current;
    g.W = rect.width;
    g.H = rect.height;
    g.x = rect.width / 2 - CHAR_SIZE / 2;
    g.targetX = g.x;
    g.prevX = g.x;
    g.phase = 0;
    g.worldY = 0;
    g.py = SPIKE_H + 40;
    g.vy = 0;
    g.standing = null;
    g.hp = MAX_HP;
    g.combo = initialComboRef.current;
    g.clearedCount = 0;
    g.failed = new Map();
    g.queue = shuffle(words).map(wordKey);
    g.bandsSinceCorrect = 99;
    g.invulnUntil = 0;
    g.last = 0;
    g.running = true;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Match the label's rendered type so measurements line up with the DOM.
      ctx.font = `700 11px ${getComputedStyle(area).fontFamily}`;
      measureRef.current = ctx;
    }

    byKeyRef.current = new Map(words.map((w) => [wordKey(w), w]));
    distractorsRef.current = [...words, ...pickDecoys(pool, words, 6)];

    platsRef.current = [];
    nodesRef.current = {};
    completedRef.current = false;
    nextIdRef.current = 1;

    setHp(MAX_HP);
    setCombo(initialComboRef.current);
    setRemaining(words.length);
    setPromptWord(byKeyRef.current.get(g.queue[0]) ?? null);
    setPhase('playing');
    setVersion((v) => v + 1);

    // Seed the shaft so the player has something under them immediately.
    for (let y = g.H * 0.55; y < g.H + BAND_GAP; y += BAND_GAP) spawnBand(y);
  }, [words, pool, spawnBand, sizeShaft]);

  useEffect(() => {
    const onResize = () => {
      sizeShaft();
      const area = areaRef.current;
      if (!area) return;
      const rect = area.getBoundingClientRect();
      gRef.current.W = rect.width;
      gRef.current.H = rect.height;
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [sizeShaft]);

  // ── Game loop ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const tick = (now: number) => {
      const g = gRef.current;
      if (!g.running) return;
      if (!g.last) g.last = now;
      // Clamp dt so a backgrounded tab doesn't teleport the player through the shaft.
      const dt = Math.min(0.05, (now - g.last) / 1000);
      g.last = now;

      const scroll = Math.min(SCROLL_MAX, SCROLL_BASE + g.clearedCount * SCROLL_STEP);
      const plats = platsRef.current;
      let structureChanged = false;

      // The camera always creeps downward through the world. Platforms are
      // fixed in world space, so this is what carries a standing player up
      // toward the spikes — the pressure that makes the mode a game.
      g.worldY += scroll * dt;

      // Horizontal steering — frame-rate independent easing toward the finger.
      const k = 1 - Math.exp(-dt / STEER_TAU);
      g.x += (g.targetX - g.x) * k;

      const prevBottom = g.py + CHAR_SIZE;

      const standing = g.standing != null ? plats.find((p) => p.id === g.standing && !p.dead) : undefined;
      if (standing) {
        // World position is pinned to the platform, so the rising camera alone
        // pushes the player up the screen.
        g.py = standing.wy - CHAR_SIZE;
        g.vy = 0;
        if (standing.kind === 'conveyor') {
          const push = (standing.dir ?? 1) * CONVEYOR_V * dt;
          g.x = clamp(g.x + push, 0, g.W - CHAR_SIZE);
          g.targetX = clamp(g.targetX + push, 0, g.W - CHAR_SIZE);
          if (dragRef.current.active) dragRef.current.originX = clamp(dragRef.current.originX + push, 0, g.W - CHAR_SIZE);
        }
        if (standing.kind === 'crumble' && standing.crumbleAt && now - standing.crumbleAt > CRUMBLE_MS) {
          standing.dead = true;
          g.standing = null;
          structureChanged = true;
        }
        if (g.x + CHAR_SIZE < standing.x || g.x > standing.x + standing.w) g.standing = null;
      } else {
        g.vy = Math.min(VY_MAX, g.vy + GRAVITY * dt);
        g.py += g.vy * dt;
      }

      // Camera follow: while falling the player is held at the anchor line, so
      // the world rushes past instead of the sprite sinking to the floor.
      const anchor = g.H * ANCHOR_RATIO;
      if (g.py - g.worldY > anchor) g.worldY = g.py - anchor;

      const bottom = g.py + CHAR_SIZE;

      for (const p of plats) {
        if (p.dead) continue;
        const xOverlap = g.x + CHAR_SIZE > p.x && g.x < p.x + p.w;
        if (!xOverlap) continue;

        if (p.kind === 'word') {
          // Word platforms are the objective, so any overlap resolves them —
          // generous to aim at, and correspondingly dangerous to brush past.
          const yOverlap = bottom > p.wy && g.py < p.wy + PLAT_H;
          if (!yOverlap || !p.word) continue;
          const key = wordKey(p.word);
          if (key === g.queue[0]) {
            g.queue.shift();
            g.clearedCount++;
            p.dead = true;
            structureChanged = true;
            loopDeps.current.onPronounce?.(p.word);
            pushCombo(g.combo + 1);
            setRemaining(g.queue.length);
            if (g.queue.length === 0) {
              setPhase('cleared');
              g.running = false;
              if (loopDeps.current.autoAdvanceOnClear) setTimeout(loopDeps.current.finish, 900);
              return;
            }
            setPromptWord(byKeyRef.current.get(g.queue[0]) ?? null);
          } else if (now > g.invulnUntil) {
            // Wrong word — the prompt word is what wasn't recognised, matching
            // how 消消樂 assigns blame.
            const promptKey = g.queue[0];
            g.failed.set(promptKey, (g.failed.get(promptKey) ?? 0) + 1);
            pushCombo(0);
            g.hp--;
            g.invulnUntil = now + INVULN_MS;
            g.vy = BOUNCE_VY;
            g.standing = null;
            p.dead = true;
            structureChanged = true;
            setHp(g.hp);
            setDamageFlash(true);
            setTimeout(() => setDamageFlash(false), 260);
            if (g.hp <= 0) {
              setPhase('over');
              g.running = false;
              return;
            }
          }
          continue;
        }

        // Terrain: only lands when falling onto the top edge.
        if (g.vy >= 0 && prevBottom <= p.wy + 1 && bottom >= p.wy) {
          g.standing = p.id;
          g.py = p.wy - CHAR_SIZE;
          g.vy = 0;
          if (p.kind === 'spring') {
            g.standing = null;
            g.vy = SPRING_VY;
          } else if (p.kind === 'crumble' && !p.crumbleAt) {
            p.crumbleAt = now;
          }
        }
      }

      // Ceiling spikes — costs HP, never a word.
      let screenY = g.py - g.worldY;
      if (screenY < SPIKE_H) {
        if (now > g.invulnUntil) {
          g.hp--;
          pushCombo(0);
          g.invulnUntil = now + INVULN_MS;
          g.standing = null;
          g.py = g.worldY + SPIKE_H + 8;
          g.vy = 180;
          setHp(g.hp);
          setDamageFlash(true);
          setTimeout(() => setDamageFlash(false), 260);
          if (g.hp <= 0) {
            setPhase('over');
            g.running = false;
            return;
          }
        } else {
          g.py = g.worldY + SPIKE_H;
        }
        screenY = g.py - g.worldY;
      }

      // Recycle platforms that scrolled off the top, and top up below the view.
      const before = plats.length;
      platsRef.current = plats.filter((p) => !p.dead && p.wy - g.worldY > -PLAT_H * 2);
      if (platsRef.current.length !== before) structureChanged = true;
      const lowest = platsRef.current.reduce((m, p) => Math.max(m, p.wy), -Infinity);
      if (lowest < g.worldY + g.H - BAND_GAP) loopDeps.current.spawnBand(g.worldY + g.H + 8);

      // Paint
      if (charRef.current) {
        charRef.current.style.transform = `translate3d(${g.x}px, ${screenY}px, 0)`;
        charRef.current.style.opacity = now < g.invulnUntil && Math.floor(now / 90) % 2 === 0 ? '0.35' : '1';
      }

      // Pose the rig. Horizontal speed drives both the lean and the stride, so
      // the figure leans into a dash and windmills its arms while falling.
      const vx = (g.x - g.prevX) / Math.max(dt, 0.001);
      g.prevX = g.x;
      const speed = Math.abs(vx);
      const airborne = g.standing == null;
      g.phase += dt * (airborne ? 7 : 5 + Math.min(11, speed / 22));

      const sway = Math.sin(g.phase);
      const lean = clamp(vx * 0.035, -22, 22);
      // Arms alternate at the sides when running; in free-fall the base is
      // mirrored so both arms splay outward instead of folding into the head.
      const armBase = airborne ? 138 : 0;
      const armAmp = airborne ? 16 : 20 + Math.min(24, speed / 9);
      const legAmp = airborne ? 11 : 16 + Math.min(28, speed / 8);

      leanRef.current?.setAttribute('transform', `rotate(${lean.toFixed(2)} 12 21.6)`);
      armLRef.current?.setAttribute('transform', `rotate(${(armBase + sway * armAmp).toFixed(2)} 10.4 9.4)`);
      armRRef.current?.setAttribute('transform', `rotate(${(-armBase - sway * armAmp).toFixed(2)} 13.6 9.4)`);
      legLRef.current?.setAttribute('transform', `rotate(${(sway * legAmp).toFixed(2)} 10.8 15)`);
      legRRef.current?.setAttribute('transform', `rotate(${(-sway * legAmp).toFixed(2)} 13.2 15)`);
      for (const p of platsRef.current) {
        const node = nodesRef.current[p.id];
        if (!node) continue;
        node.style.transform = `translate3d(${p.x}px, ${p.wy - g.worldY}px, 0)`;
        if (p.crumbleAt) {
          node.style.opacity = String(Math.max(0, 1 - (now - p.crumbleAt) / CRUMBLE_MS));
        }
      }

      if (structureChanged) setVersion((v) => v + 1);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      gRef.current.running = false;
    };
    // Mount-once: the cleanup stops the game, so re-running this effect because
    // a parent re-render rebuilt `onComplete` would freeze the round dead.
    // Everything mutable is read through loopDeps instead.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Steering ──────────────────────────────────────────────────────────────

  // Panning is relative, not absolute: touching down anchors on wherever the
  // figure already is, and it then tracks the drag delta 1:1. Tapping a new
  // spot no longer teleports it across the shaft.
  const dragRef = useRef({ active: false, originClientX: 0, originX: 0 });

  const beginDrag = useCallback((clientX: number) => {
    const g = gRef.current;
    if (!g.running) return;
    dragRef.current = { active: true, originClientX: clientX, originX: g.x };
    g.targetX = g.x;
  }, []);

  const dragTo = useCallback((clientX: number) => {
    const g = gRef.current;
    const d = dragRef.current;
    if (!d.active || !g.running) return;
    g.targetX = clamp(d.originX + (clientX - d.originClientX), 0, g.W - CHAR_SIZE);
  }, []);

  const registerNode = useCallback((p: Plat) => (el: HTMLDivElement | null) => {
    nodesRef.current[p.id] = el;
    if (el) el.style.transform = `translate3d(${p.x}px, ${p.wy - gRef.current.worldY}px, 0)`;
  }, []);

  loopDeps.current = { finish, spawnBand, onPronounce, autoAdvanceOnClear };
  (window as any).__dropAnswer = promptWord ? promptText(promptWord) : null; // TEMP-TEST-HOOK

  const hearts = Array.from({ length: MAX_HP }, (_, i) => i < hp);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 pb-3 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {setTotal ? t('quizMode.setProgress', { current: setIndex, total: setTotal }) : t('quizMode.roundNo', { n: setIndex })}
          <span className="ml-2 text-gray-400 dark:text-gray-500">{t('quizMode.remaining', { count: remaining })}</span>
        </p>
        <div className="flex items-center gap-2">
          {combo >= 2 && (
            <span key={combo} className="animate-quiz-combo text-xs font-bold text-orange-500 dark:text-orange-400">
              {t('quizMode.combo', { count: combo })} 🔥
            </span>
          )}
          <span className="text-xs tracking-tight" aria-label={`HP ${hp}`}>
            {hearts.map((full, i) => (
              <span key={i} className={full ? '' : 'opacity-25 grayscale'}>❤️</span>
            ))}
          </span>
        </div>
      </div>

      {/* Prompt */}
      <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-900/20 dark:to-orange-900/10 border border-rose-200 dark:border-rose-800/60 px-4 py-2.5 mb-2.5 text-center min-h-[3.5rem] flex flex-col items-center justify-center">
        <p className="text-[11px] uppercase tracking-wider text-rose-500/70 dark:text-rose-400/70 font-semibold mb-1">
          {t('quizMode.dropHint')}
        </p>
        <p className="text-sm font-bold text-gray-800 dark:text-gray-100 leading-snug break-words line-clamp-2">
          {promptWord ? meaningText(promptWord, i18n.language) : ''}
        </p>
      </div>

      {/* Shaft */}
      <div
        ref={areaRef}
        onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ } beginDrag(e.clientX); }}
        onPointerMove={(e) => dragTo(e.clientX)}
        onPointerUp={() => { dragRef.current.active = false; }}
        onPointerCancel={() => { dragRef.current.active = false; }}
        className={`quiz-drop-shaft relative overflow-hidden rounded-xl touch-none select-none cursor-pointer border-2 transition-colors ${
          damageFlash
            ? 'border-red-400 bg-red-50 dark:bg-red-950/40'
            : 'border-gray-200 dark:border-gray-700 bg-gradient-to-b from-sky-50 to-indigo-50 dark:from-gray-900 dark:to-gray-950'
        }`}
      >
        {/* Ceiling spikes */}
        <div
          className="absolute inset-x-0 top-0 z-20 flex text-red-500"
          style={{ height: SPIKE_H }}
          aria-hidden="true"
        >
          {Array.from({ length: 26 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 bg-current"
              style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }}
            />
          ))}
        </div>

        {/* Platforms */}
        {platsRef.current.map((p) => (
          <div
            key={p.id}
            ref={registerNode(p)}
            className={`absolute top-0 left-0 will-change-transform rounded-lg flex items-center justify-center px-2 text-[11px] font-bold whitespace-nowrap overflow-hidden ${
              p.kind === 'word'
                ? 'bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-500 text-gray-800 dark:text-gray-100 shadow-sm'
                : p.kind === 'spring'
                  ? 'bg-emerald-200 dark:bg-emerald-800 border-2 border-emerald-400 dark:border-emerald-600 text-emerald-700 dark:text-emerald-200'
                  : p.kind === 'conveyor'
                    ? 'bg-amber-200 dark:bg-amber-800/70 border-2 border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-200'
                    : p.kind === 'crumble'
                      ? 'bg-stone-200 dark:bg-stone-700 border-2 border-dashed border-stone-400 dark:border-stone-500 text-stone-500 dark:text-stone-300'
                      : 'bg-slate-300 dark:bg-slate-600 border-2 border-slate-400 dark:border-slate-500'
            }`}
            style={{ width: p.w, height: PLAT_H }}
          >
            {p.kind === 'word' && <span className="truncate">{promptText(p.word!)}</span>}
            {p.kind === 'spring' && <span>⌃⌃⌃</span>}
            {p.kind === 'conveyor' && <span>{(p.dir ?? 1) < 0 ? '‹‹‹' : '›››'}</span>}
            {p.kind === 'crumble' && <span>┄┄┄</span>}
          </div>
        ))}

        {/* Character */}
        <div
          ref={charRef}
          className="absolute top-0 left-0 z-10 will-change-transform"
          style={{ width: CHAR_SIZE, height: CHAR_SIZE }}
        >
          <svg viewBox="0 0 24 24" width={CHAR_SIZE} height={CHAR_SIZE} aria-hidden="true" overflow="visible">
            <g ref={leanRef}>
              {/* legs — offset to either hip so they read as two limbs */}
              <line ref={legLRef} x1="10.8" y1="15" x2="10.8" y2="21.6"
                stroke="#1e3a5f" strokeWidth="2.1" strokeLinecap="round" />
              <line ref={legRRef} x1="13.2" y1="15" x2="13.2" y2="21.6"
                stroke="#2f6ea8" strokeWidth="2.1" strokeLinecap="round" />
              {/* torso */}
              <line x1="12" y1="7.8" x2="12" y2="15"
                stroke="#38bdf8" strokeWidth="3.6" strokeLinecap="round" />
              {/* arms — drawn after the torso so they stay visible in front */}
              <line ref={armLRef} x1="10.4" y1="9.4" x2="10.4" y2="14.4"
                stroke="#e39a5c" strokeWidth="1.9" strokeLinecap="round" />
              <line ref={armRRef} x1="13.6" y1="9.4" x2="13.6" y2="14.4"
                stroke="#ffc48c" strokeWidth="1.9" strokeLinecap="round" />
              {/* head */}
              <circle cx="12" cy="4.4" r="3.2" fill="#ffc48c" stroke="#c98b53" strokeWidth="0.6" />
              <circle cx="10.8" cy="4.2" r="0.5" fill="#3f2a16" />
              <circle cx="13.2" cy="4.2" r="0.5" fill="#3f2a16" />
            </g>
          </svg>
        </div>

        {/* End-of-round banner — waits for the player rather than auto-advancing */}
        {phase !== 'playing' && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-[1px] px-6">
            <div className="animate-quiz-clear flex flex-col items-center gap-3">
              <div className={`text-white text-sm font-bold px-5 py-2.5 rounded-2xl shadow-lg ${
                phase === 'cleared' ? 'bg-green-500' : 'bg-gray-700'
              }`}>
                {phase === 'cleared' ? t('quizMode.setClear') : t('quizMode.gameOver')}
              </div>
              {!(autoAdvanceOnClear && phase === 'cleared') && (
                <button
                  onClick={(e) => { e.stopPropagation(); finish(); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="bg-white text-gray-900 text-sm font-bold px-6 py-3 rounded-2xl shadow-xl active:scale-95 transition-transform"
                >
                  {t('quizMode.nextRound')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DropBoard;
