import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChallenge } from '../../contexts/ChallengeContext';
import { useAuth } from '../../contexts/AuthContext';
import { ChallengePlayer } from '../../services/challenge.service';

const MEDAL = ['🥇', '🥈', '🥉'];

const Scoreboard: React.FC<{ players: ChallengePlayer[]; myUserId: string }> = ({ players, myUserId }) => {
  const { t } = useTranslation();
  return (
    <div className="bg-surface rounded-2xl border border-line p-3 shadow-sm">
      <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">{t('challenge.scoreboard')}</p>
      <div className="space-y-1">
        {players.map((p, i) => (
          <div key={p.userId} className={`flex items-center gap-2 rounded-xl px-2 py-1 ${p.userId === myUserId ? 'bg-accent-soft ' : ''}`}>
            <span className="text-sm w-5 text-center">{MEDAL[i] ?? `${i + 1}.`}</span>
            <span className="flex-1 text-sm text-ink truncate">{p.displayName}</span>
            <span className="text-sm font-semibold text-accent">{p.score}</span>
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
  const myUserId = isLoggedIn && user ? user.uuid : (localStorage.getItem('hw-guest-id') || '');

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
    <div className="flex flex-col min-h-screen bg-paper">
      {/* Header */}
      <div className="border-b border-line bg-surface backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 h-14 max-w-2xl mx-auto w-full">
          <button onClick={onLeave} className="p-2 -ml-2 rounded-xl hover:bg-ink/5 transition-colors">
            <svg className="w-5 h-5 text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-ink truncate text-sm">{currentRoom.name}</p>
            <p className="text-xs text-ink-faint">
              {isPlaying
                ? `${t('challenge.round')} ${currentRoom.currentRound} / ${currentRoom.totalRounds}`
                : currentRoom.status}
            </p>
          </div>
          {timeLeft != null && timeLeft > 0 && (
            <div className={`text-lg font-semibold tabular-nums ${timeLeft <= 5 ? 'text-danger' : 'text-accent'}`}>
              {timeLeft}s
            </div>
          )}
        </div>
      </div>

      {idleWarning && (
        <div className="bg-ink text-paper text-xs font-semibold text-center px-4 py-2">
          {t('challenge.idleWarning')}
        </div>
      )}

      <main className="flex-1 pb-4 px-4 pt-4 max-w-2xl mx-auto w-full space-y-3">

        {/* Scoreboard */}
        <Scoreboard players={sortedPlayers} myUserId={myUserId} />

        {/* WAITING state */}
        {isWaiting && (
          <div className="bg-surface rounded-2xl border border-line p-6 text-center shadow-sm">
            <p className="text-sm text-ink-muted mb-4">
              {t('challenge.waitingForPlayers', { count: currentRoom.players.length })}
            </p>
            {isHost && (
              <button
                onClick={startGameAction}
                className="px-6 py-2.5 bg-ink hover:bg-ink/85 text-paper font-semibold rounded-xl transition-colors"
              >
                {t('challenge.startGame')}
              </button>
            )}
            {!isHost && <p className="text-xs text-ink-faint">{t('challenge.waitingForHost')}</p>}
          </div>
        )}

        {/* GAME OVER state */}
        {isGameOver && (
          <div className="bg-surface rounded-2xl border border-line p-6 text-center shadow-sm">
            <p className="text-lg font-semibold text-ink mb-1">{t('challenge.gameOver')}</p>
            {sortedPlayers[0] && (
              <p className="text-sm text-ink-muted">
                {t('challenge.winner', { name: sortedPlayers[0].displayName, score: sortedPlayers[0].score })}
              </p>
            )}
            {currentRoom.system && (
              <p className="text-xs text-ink-faint mt-3">{t('challenge.nextGameSoon')}</p>
            )}
          </div>
        )}

        {/* PLAYING state */}
        {isPlaying && (
          <div className="bg-surface rounded-2xl border border-line p-4 shadow-sm">
            {question ? (
              <>
                <p className="text-xs text-ink-faint mb-2 text-center">
                  {currentRoom.gameFormat === 'MULTI_CHOICE' ? t('challenge.chooseAnswer') : t('challenge.typeWordMatch')}
                </p>
                <div className="text-center mb-4">
                  <p className="text-2xl font-semibold text-ink leading-tight">{question}</p>
                  {hint && timeLeft !== null && timeLeft <= 5 && timeLeft > 0 && (
                    <p className="mt-2 text-sm font-mono font-semibold text-accent tracking-widest">
                      {t('challenge.hint', { hint })}
                    </p>
                  )}
                </div>

                {currentRoom.gameFormat === 'MULTI_CHOICE' ? (
                  /* ── Multi-choice 2×2 grid ── */
                  <>
                  {answered && roundMsg && (
                    <p className="text-xs text-center font-medium text-ink mb-3">{roundMsg}</p>
                  )}
                  <div className="grid grid-cols-1 gap-2">
                    {choices.map(choice => {
                      const isSelected = selectedChoice === choice;
                      const isCorrect = revealedCorrect === choice;
                      const isWrong = isSelected && revealedCorrect !== null && revealedCorrect !== choice;
                      let cls = 'w-full py-3 px-3 text-sm font-semibold rounded-xl border-2 transition-colors text-left';
                      if (isCorrect) {
                        cls += ' bg-success-soft border-success text-success';
                      } else if (isWrong) {
                        cls += ' bg-danger-soft border-danger text-danger';
                      } else if (isSelected) {
                        cls += ' bg-accent-soft border-accent text-accent';
                      } else {
                        cls += ' bg-paper border-line text-ink hover:border-accent';
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
                        className={`flex-1 rounded-xl border bg-paper text-sm px-3 py-2.5 focus:outline-none focus:ring-2 transition-colors ${
                          wrongFeedback
                            ? 'border-danger focus:ring-danger'
                            : answered
                              ? 'opacity-50 border-line '
                              : 'border-line focus:ring-accent'
                        }`}
                      />
                      <button
                        onClick={handleSubmit}
                        disabled={!answer.trim() || answered}
                        className="px-4 py-2 bg-ink hover:bg-ink/85 disabled:opacity-40 text-paper text-sm font-semibold rounded-xl transition-colors"
                      >
                        ↵
                      </button>
                    </div>
                    {wrongFeedback && (
                      <p className="text-xs text-center text-danger mt-2">{t('challenge.wrongAnswer')}</p>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="text-center py-4">
                {roundMsg ? (
                  <p className="text-sm font-medium text-ink">{roundMsg}</p>
                ) : (
                  <p className="text-sm text-ink-faint">{t('challenge.getReady')}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Round result message when not playing */}
        {!isPlaying && roundMsg && (
          <div className="bg-paper rounded-xl p-3 text-center">
            <p className="text-sm text-ink-muted">{roundMsg}</p>
          </div>
        )}

      </main>
    </div>
  );
};

export default ChallengeRoomPage;
