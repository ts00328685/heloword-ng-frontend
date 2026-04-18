import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../../components/Header';
import { KirbyGame, getKirbyHighScore, GamePhase } from './kirbyGame';

const KirbyGamePage: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<KirbyGame | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [score, setScore] = useState(0);
  const [hp, setHp] = useState(3);
  const [phase, setPhase] = useState<GamePhase>('start');
  const [highScore, setHighScore] = useState(getKirbyHighScore());
  const [scale, setScale] = useState(1);

  // Responsive scaling
  useEffect(() => {
    const update = () => {
      if (!wrapRef.current) return;
      const w = wrapRef.current.clientWidth;
      setScale(Math.min(1, w / 960));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new KirbyGame(canvas, {
      onScoreChange: setScore,
      onHpChange: setHp,
      onPhaseChange: (p) => {
        setPhase(p as GamePhase);
        if (p === 'win' || p === 'gameover') setHighScore(getKirbyHighScore());
      },
    });
    gameRef.current = game;
    return () => { game.destroy(); gameRef.current = null; };
  }, []);

  const g = () => gameRef.current;

  // Prevent page scroll when game is active
  useEffect(() => {
    const block = (e: TouchEvent) => { if (phase === 'playing') e.preventDefault(); };
    document.addEventListener('touchmove', block, { passive: false });
    return () => document.removeEventListener('touchmove', block);
  }, [phase]);

  const handleStart = useCallback(() => g()?.pressJump(), []);
  const handleJump = useCallback(() => g()?.pressJump(), []);
  const handleDoor = useCallback(() => g()?.pressEnterDoor(), []);
  const handleRightDown = useCallback(() => g()?.pressRight(true), []);
  const handleRightUp = useCallback(() => g()?.pressRight(false), []);
  const handleLeftDown = useCallback(() => g()?.pressLeft(true), []);
  const handleLeftUp = useCallback(() => g()?.pressLeft(false), []);
  const handleAttackDown = useCallback(() => g()?.pressAttack(true), []);
  const handleAttackUp = useCallback(() => g()?.pressAttack(false), []);

  const isDone = phase === 'win' || phase === 'gameover';

  return (
    <div className="flex flex-col min-h-screen bg-gray-900 animate-page-enter">
      <Header title="Kirby Adventure" />

      <main className="flex-1 pb-24 px-2 pt-3 flex flex-col items-center max-w-3xl mx-auto w-full gap-3">

        {/* Score bar */}
        <div className="w-full flex items-center justify-between px-3 py-1.5 bg-gray-800 rounded-xl text-sm">
          <span className="text-yellow-400 font-bold">Score: {score}</span>
          <span className="text-red-400 font-bold">HP: {'❤️'.repeat(Math.max(0, hp))}</span>
          <div className="flex items-center gap-2">
            <span className="text-blue-300 text-xs">Best: {highScore}</span>
            <a
              href="https://github.com/lalilali"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              title="GitHub"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3
.405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.016 12.016 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>

        {/* Canvas wrapper — scales down on small screens */}
        <div ref={wrapRef} className="w-full rounded-xl border-2 border-gray-700 shadow-lg overflow-hidden"
          style={{ height: Math.round(480 * scale) }}>
          <div style={{ width: 960, height: 480, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <canvas ref={canvasRef} width={960} height={480} className="block" />
          </div>
        </div>

        {/* Controls hint */}
        <p className="text-xs text-gray-500 text-center hidden sm:block">
          Arrow keys · Space = jump · Ctrl = attack · ↑ = enter door
        </p>

        {/* Mobile on-screen controls */}
        <div className="flex flex-col items-center gap-3 w-full sm:hidden select-none">
          {(phase === 'start' || phase === 'stage-intro') && (
            <button
              onTouchStart={handleStart}
              className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-2xl text-lg active:scale-95 transition-transform"
            >
              {phase === 'start' ? '▶ Start Game' : '▶ Ready!'}
            </button>
          )}

          {phase === 'playing' && (
            <>
              {/* D-pad row */}
              <div className="flex items-center justify-between w-full px-4">
                {/* Left / Right */}
                <div className="flex gap-2">
                  <button
                    onTouchStart={handleLeftDown} onTouchEnd={handleLeftUp}
                    onMouseDown={handleLeftDown} onMouseUp={handleLeftUp}
                    className="w-16 h-16 bg-gray-700 rounded-full text-2xl flex items-center justify-center active:bg-gray-500"
                  >◀</button>
                  <button
                    onTouchStart={handleRightDown} onTouchEnd={handleRightUp}
                    onMouseDown={handleRightDown} onMouseUp={handleRightUp}
                    className="w-16 h-16 bg-gray-700 rounded-full text-2xl flex items-center justify-center active:bg-gray-500"
                  >▶</button>
                </div>
                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onTouchStart={handleAttackDown} onTouchEnd={handleAttackUp}
                    onMouseDown={handleAttackDown} onMouseUp={handleAttackUp}
                    className="w-16 h-16 bg-red-600 rounded-full text-xl font-bold flex items-center justify-center active:bg-red-400"
                  >ATK</button>
                  <button
                    onTouchStart={handleJump}
                    onMouseDown={handleJump}
                    className="w-16 h-16 bg-blue-500 rounded-full text-xl font-bold flex items-center justify-center active:bg-blue-300"
                  >↑</button>
                </div>
              </div>
              {/* Enter door button */}
              <button
                onTouchStart={handleDoor}
                onMouseDown={handleDoor}
                className="px-6 py-2 bg-green-600 rounded-xl text-sm font-bold active:bg-green-400"
              >🚪 Enter Door</button>
            </>
          )}

          {isDone && (
            <button
              onClick={() => navigate('/challenge')}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl text-base"
            >
              ← Back to Challenge
            </button>
          )}
        </div>

        {/* Desktop back button when done */}
        {isDone && (
          <button
            onClick={() => navigate('/challenge')}
            className="hidden sm:block px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl"
          >
            ← Back to Challenge
          </button>
        )}
      </main>
    </div>
  );
};

export default KirbyGamePage;
