import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChallenge } from '../../contexts/ChallengeContext';
import { useAuth } from '../../contexts/AuthContext';
import { ChallengePlayer } from '../../services/challenge.service';

const MEDAL = ['🥇', '🥈', '🥉'];

const Scoreboard: React.FC<{ players: ChallengePlayer[]; myUserId: string }> = ({ players, myUserId }) => {
  const { t } = useTranslation();
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{t('challenge.scoreboard')}</p>
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
};

const ChallengeRoomPage: React.FC<{ onLeave: () => Promise<void> }> = ({ onLeave }) => {
  const { t } = useTranslation();
  const { currentRoom, lastEvent, startGameAction, submitAnswer, idleWarning } = useChallenge();
  const { isLoggedIn, user } = useAuth();
  const myUserId = isLoggedIn && user ? user.username : (localStorage.getItem('hw-guest-id') || '');

  const [answer, setAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [roundMsg, setRoundMsg] = useState<string | null>(null);
  // answered=true means the question has been resolved (win or timeout) — blocks further input
  const [answered, setAnswered] = useState(false);
  // wrongFeedback=true shows a brief "wrong answer" flash without blocking input
  const [wrongFeedback, setWrongFeedback] = useState(false);
  // Multi-choice state
  const [choices, setChoices] = useState<string[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [revealedCorrect, setRevealedCorrect] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wrongTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!lastEvent) return;
    const ev = lastEvent;

    if (ev.type === 'QUESTION') {
      setQuestion(ev.question ?? null);
      setQuestionId(ev.questionId ?? null);
      setHint(ev.hint ?? null);
      setTimeLeft(ev.timeoutSeconds ?? 15);
      setAnswer('');
      setAnswered(false);
      setWrongFeedback(false);
      setRoundMsg(null);
      setChoices(ev.choices ?? []);
      setSelectedChoice(null);
      setRevealedCorrect(null);
      inputRef.current?.focus();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t === null || t <= 1) { clearInterval(timerRef.current!); return 0; }
          return t - 1;
        });
      }, 1000);
    }

    if (ev.type === 'WRONG_ANSWER') {
      // Only show feedback to the player who got it wrong
      if (ev.targetUserId === myUserId) {
        setWrongFeedback(true);
        setAnswer('');
        if (wrongTimeoutRef.current) clearTimeout(wrongTimeoutRef.current);
        wrongTimeoutRef.current = setTimeout(() => setWrongFeedback(false), 1500);
        inputRef.current?.focus();
      }
    }

    if (ev.type === 'ROUND_WIN') {
      clearInterval(timerRef.current!);
      setTimeLeft(null);
      setAnswered(true);
      if (ev.correctAnswer) setRevealedCorrect(ev.correctAnswer);
      const isMe = ev.winnerId === myUserId;
      const pts = ev.pointsAwarded ?? 1;
      setRoundMsg(isMe
        ? t('challenge.youGotIt', { points: pts })
        : t('challenge.someoneAnswered', { name: ev.winnerName, word: ev.correctAnswer, points: pts }));
      // For typing mode clear question to show roundMsg panel; for multi-choice keep it so
      // the color reveal is visible until the next QUESTION event clears it.
      if (currentRoom?.gameFormat !== 'MULTI_CHOICE') setQuestion(null);
    }

    if (ev.type === 'QUESTION_TIMEOUT') {
      clearInterval(timerRef.current!);
      setTimeLeft(null);
      setAnswered(true);
      if (ev.correctAnswer) setRevealedCorrect(ev.correctAnswer);
      setRoundMsg(t('challenge.timesUp', { word: ev.correctAnswer }));
      if (currentRoom?.gameFormat !== 'MULTI_CHOICE') setQuestion(null);
    }

    if (ev.type === 'GAME_OVER') {
      clearInterval(timerRef.current!);
      setTimeLeft(null);
      setQuestion(null);
      setRoundMsg(null);
    }
  }, [lastEvent, myUserId, t, currentRoom?.gameFormat]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (wrongTimeoutRef.current) clearTimeout(wrongTimeoutRef.current);
  }, []);

  const handleSubmit = () => {
    if (!answer.trim() || !questionId || answered) return;
    submitAnswer(answer.trim(), questionId);
    // Do NOT set answered=true here — keep input open for unlimited guesses
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
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 h-14 max-w-2xl mx-auto w-full">
          <button onClick={onLeave} className="p-2 -ml-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 dark:text-gray-100 truncate text-sm">{currentRoom.name}</p>
            <p className="text-xs text-gray-400">
              {isPlaying
                ? `${t('challenge.round')} ${currentRoom.currentRound} / ${currentRoom.totalRounds}`
                : currentRoom.status}
            </p>
          </div>
          {timeLeft != null && timeLeft > 0 && (
            <div className={`text-lg font-bold tabular-nums ${timeLeft <= 5 ? 'text-red-500' : 'text-blue-500'}`}>
              {timeLeft}s
            </div>
          )}
        </div>
      </div>

      {idleWarning && (
        <div className="bg-orange-500 text-white text-xs font-semibold text-center px-4 py-2">
          {t('challenge.idleWarning')}
        </div>
      )}

      <main className="flex-1 pb-4 px-4 pt-4 max-w-2xl mx-auto w-full space-y-3">

        {/* Scoreboard */}
        <Scoreboard players={sortedPlayers} myUserId={myUserId} />

        {/* WAITING state */}
        {isWaiting && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 text-center shadow-sm">
            <p className="text-2xl mb-2">🎮</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {t('challenge.waitingForPlayers', { count: currentRoom.players.length })}
            </p>
            {isHost && (
              <button
                onClick={startGameAction}
                className="px-6 py-2.5 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors"
              >
                {t('challenge.startGame')}
              </button>
            )}
            {!isHost && <p className="text-xs text-gray-400">{t('challenge.waitingForHost')}</p>}
          </div>
        )}

        {/* GAME OVER state */}
        {isGameOver && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 text-center shadow-sm">
            <p className="text-3xl mb-2">🏆</p>
            <p className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1">{t('challenge.gameOver')}</p>
            {sortedPlayers[0] && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('challenge.winner', { name: sortedPlayers[0].displayName, score: sortedPlayers[0].score })}
              </p>
            )}
            {currentRoom.system && (
              <p className="text-xs text-gray-400 mt-3">{t('challenge.nextGameSoon')}</p>
            )}
          </div>
        )}

        {/* PLAYING state */}
        {isPlaying && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            {question ? (
              <>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2 text-center">
                  {currentRoom.gameFormat === 'MULTI_CHOICE' ? t('challenge.chooseAnswer') : t('challenge.typeWordMatch')}
                </p>
                <div className="text-center mb-4">
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100 leading-tight">{question}</p>
                  {hint && timeLeft !== null && timeLeft <= 5 && timeLeft > 0 && (
                    <p className="mt-2 text-sm font-mono font-semibold text-orange-500 tracking-widest">
                      {t('challenge.hint', { hint })}
                    </p>
                  )}
                </div>

                {currentRoom.gameFormat === 'MULTI_CHOICE' ? (
                  /* ── Multi-choice 2×2 grid ── */
                  <>
                  {answered && roundMsg && (
                    <p className="text-xs text-center font-medium text-gray-700 dark:text-gray-300 mb-3">{roundMsg}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {choices.map(choice => {
                      const isSelected = selectedChoice === choice;
                      const isCorrect = revealedCorrect === choice;
                      const isWrong = isSelected && revealedCorrect !== null && revealedCorrect !== choice;
                      let cls = 'w-full py-3 px-3 text-sm font-semibold rounded-xl border-2 transition-colors text-left';
                      if (isCorrect) {
                        cls += ' bg-green-100 border-green-500 text-green-800 dark:bg-green-900/30 dark:text-green-300';
                      } else if (isWrong) {
                        cls += ' bg-red-100 border-red-500 text-red-800 dark:bg-red-900/30 dark:text-red-300';
                      } else if (isSelected) {
                        cls += ' bg-blue-100 border-blue-500 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
                      } else {
                        cls += ' bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-400 dark:hover:border-blue-500';
                      }
                      return (
                        <button
                          key={choice}
                          disabled={selectedChoice !== null || answered}
                          onClick={() => {
                            if (selectedChoice || answered || !questionId) return;
                            setSelectedChoice(choice);
                            submitAnswer(choice, questionId);
                          }}
                          className={cls}
                        >
                          {choice}
                        </button>
                      );
                    })}
                  </div>
                  </>
                ) : (
                  /* ── Free-text typing input ── */
                  <>
                    <div className="flex gap-2">
                      <input
                        ref={inputRef}
                        value={answer}
                        onChange={e => setAnswer(e.target.value)}
                        onKeyDown={handleKey}
                        disabled={answered}
                        placeholder={t('challenge.typeAnswer')}
                        autoFocus
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        className={`flex-1 rounded-xl border bg-gray-50 dark:bg-gray-900 text-sm px-3 py-2.5 focus:outline-none focus:ring-2 transition-colors ${
                          wrongFeedback
                            ? 'border-red-400 focus:ring-red-400'
                            : answered
                              ? 'opacity-50 border-gray-200 dark:border-gray-700'
                              : 'border-gray-200 dark:border-gray-700 focus:ring-blue-400'
                        }`}
                      />
                      <button
                        onClick={handleSubmit}
                        disabled={!answer.trim() || answered}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
                      >
                        ↵
                      </button>
                    </div>
                    {wrongFeedback && (
                      <p className="text-xs text-center text-red-500 mt-2">{t('challenge.wrongAnswer')}</p>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="text-center py-4">
                {roundMsg ? (
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{roundMsg}</p>
                ) : (
                  <p className="text-sm text-gray-400">{t('challenge.getReady')}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Round result message when not playing */}
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
