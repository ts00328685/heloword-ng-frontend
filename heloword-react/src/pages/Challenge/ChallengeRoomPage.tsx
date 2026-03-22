import React, { useEffect, useRef, useState } from 'react';
import { useChallenge } from '../../contexts/ChallengeContext';
import { useAuth } from '../../contexts/AuthContext';
import { ChallengePlayer } from '../../services/challenge.service';

const MEDAL = ['🥇', '🥈', '🥉'];

const Scoreboard: React.FC<{ players: ChallengePlayer[]; myUserId: string }> = ({ players, myUserId }) => (
  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Scoreboard</p>
    <div className="space-y-1">
      {players.map((p, i) => (
        <div key={p.userId} className={`flex items-center gap-2 rounded-xl px-2 py-1 ${p.userId === myUserId ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
          <span className="text-sm w-5 text-center">{MEDAL[i] ?? `${i + 1}.`}</span>
          <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate">{p.displayName}</span>
          <span className="text-sm font-bold text-blue-500">{p.score}</span>
        </div>
      ))}
    </div>
  </div>
);

const ChallengeRoomPage: React.FC<{ onLeave: () => Promise<void> }> = ({ onLeave }) => {
  const { currentRoom, lastEvent, startGameAction, submitAnswer } = useChallenge();
  const { isLoggedIn, user } = useAuth();
  const myUserId = isLoggedIn && user ? user.username : (localStorage.getItem('hw-guest-id') || '');

  const [answer, setAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [roundMsg, setRoundMsg] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Process incoming events
  useEffect(() => {
    if (!lastEvent) return;
    const ev = lastEvent;

    if (ev.type === 'QUESTION') {
      setQuestion(ev.question ?? null);
      setQuestionId(ev.questionId ?? null);
      setTimeLeft(ev.timeoutSeconds ?? 15);
      setAnswer('');
      setAnswered(false);
      setRoundMsg(null);
      inputRef.current?.focus();
      // Start countdown
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t === null || t <= 1) { clearInterval(timerRef.current!); return 0; }
          return t - 1;
        });
      }, 1000);
    }

    if (ev.type === 'ROUND_WIN') {
      clearInterval(timerRef.current!);
      setTimeLeft(null);
      setQuestion(null);
      const isMe = ev.winnerId === myUserId;
      setRoundMsg(isMe
        ? `✅ You got it! +1 point`
        : `⚡ ${ev.winnerName} answered: ${ev.correctAnswer}`);
    }

    if (ev.type === 'QUESTION_TIMEOUT') {
      clearInterval(timerRef.current!);
      setTimeLeft(null);
      setQuestion(null);
      setRoundMsg(`⏰ Time's up! Answer: ${ev.correctAnswer}`);
    }

    if (ev.type === 'GAME_OVER') {
      clearInterval(timerRef.current!);
      setTimeLeft(null);
      setQuestion(null);
      setRoundMsg(null);
    }
  }, [lastEvent, myUserId]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const handleSubmit = () => {
    if (!answer.trim() || !questionId || answered) return;
    setAnswered(true);
    submitAnswer(answer.trim(), questionId);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  if (!currentRoom) return null;

  const isGameOver = currentRoom.status === 'FINISHED';
  const isPlaying = currentRoom.status === 'PLAYING';
  const isWaiting = currentRoom.status === 'WAITING';
  const isHost = currentRoom.hostUserId === myUserId;
  const sortedPlayers = [...currentRoom.players].sort((a, b) => b.score - a.score);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm sticky top-0 z-10">
        <button onClick={onLeave} className="p-2 -ml-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 dark:text-gray-100 truncate text-sm">{currentRoom.name}</p>
          <p className="text-xs text-gray-400">
            {isPlaying ? `Round ${currentRoom.currentRound} / ${currentRoom.totalRounds}` : currentRoom.status}
          </p>
        </div>
        {timeLeft != null && timeLeft > 0 && (
          <div className={`text-lg font-bold tabular-nums ${timeLeft <= 5 ? 'text-red-500' : 'text-blue-500'}`}>
            {timeLeft}s
          </div>
        )}
      </div>

      <main className="flex-1 pb-4 px-4 pt-4 max-w-2xl mx-auto w-full space-y-3">

        {/* Scoreboard */}
        <Scoreboard players={sortedPlayers} myUserId={myUserId} />

        {/* WAITING state */}
        {isWaiting && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 text-center shadow-sm">
            <p className="text-2xl mb-2">🎮</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {currentRoom.players.length} player{currentRoom.players.length !== 1 ? 's' : ''} waiting…
            </p>
            {isHost && (
              <button
                onClick={startGameAction}
                className="px-6 py-2.5 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors"
              >
                Start Game
              </button>
            )}
            {!isHost && <p className="text-xs text-gray-400">Waiting for host to start…</p>}
          </div>
        )}

        {/* GAME OVER state */}
        {isGameOver && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 text-center shadow-sm">
            <p className="text-3xl mb-2">🏆</p>
            <p className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1">Game Over!</p>
            {sortedPlayers[0] && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Winner: <span className="font-semibold text-yellow-500">{sortedPlayers[0].displayName}</span> with {sortedPlayers[0].score} pts
              </p>
            )}
            {currentRoom.system && (
              <p className="text-xs text-gray-400 mt-3">Next game starting soon…</p>
            )}
          </div>
        )}

        {/* PLAYING state */}
        {isPlaying && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            {question ? (
              <>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2 text-center">Type the word that matches:</p>
                <div className="text-center mb-4">
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100 leading-tight">{question}</p>
                </div>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    onKeyDown={handleKey}
                    disabled={answered}
                    placeholder="Type your answer…"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className={`flex-1 rounded-xl border bg-gray-50 dark:bg-gray-900 text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 ${answered ? 'opacity-50' : 'border-gray-200 dark:border-gray-700'}`}
                  />
                  <button
                    onClick={handleSubmit}
                    disabled={!answer.trim() || answered}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    ↵
                  </button>
                </div>
                {answered && (
                  <p className="text-xs text-center text-blue-500 mt-2">Waiting for result…</p>
                )}
              </>
            ) : (
              <div className="text-center py-4">
                {roundMsg ? (
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{roundMsg}</p>
                ) : (
                  <p className="text-sm text-gray-400">Get ready…</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Round result message when question area is not shown */}
        {!isPlaying && roundMsg && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">{roundMsg}</p>
          </div>
        )}

      </main>
    </div>
  );
};

export default ChallengeRoomPage;
