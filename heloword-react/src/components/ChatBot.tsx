import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { quickTranslate, QuickTranslateResult, getSampleSentence, getVerbConjugation } from '../services/llm.service';
import { pronounceWord, cleanSentenceForTTS, toLangCode } from '../services/tts.service';
import AddToGroupModal from './AddToGroupModal';
import { Sentence } from '../models';

const HISTORY_KEY = 'hw-chatbot-history';

interface ChatEntry {
  id: string;
  type: 'translate' | 'sentence' | 'conjugation';
  input: string;
  word: string;
  translateEn: string;
  translateCh: string;
  sentence?: string;
  conjugations?: string;
  wordLang: string;
  timestamp: number;
}

// ── Kitten SVG ────────────────────────────────────────────────────────────────

type WinkEye = 'none' | 'left' | 'right';

const OpenEye: React.FC<{ cx: number; shineCx: number }> = ({ cx, shineCx }) => (
  <>
    <ellipse cx={cx} cy="50" rx="11" ry="10" fill="#f1f5f9" />
    <ellipse cx={cx} cy="50" rx="8" ry="9" fill="#d97706" />
    <ellipse cx={cx} cy="50" rx="2.5" ry="7" fill="#1e293b" />
    <circle cx={shineCx} cy="47" r="2" fill="white" opacity="0.9" />
  </>
);

const WinkLine: React.FC<{ cx: number }> = ({ cx }) => (
  <path
    d={`M${cx - 10} 51 Q${cx} 57 ${cx + 10} 51`}
    stroke="#4b5563" strokeWidth="2.5" strokeLinecap="round" fill="none"
  />
);

const KittenSVG: React.FC<{ wink: WinkEye; size?: number }> = ({ wink, size = 52 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Ears (rounded, behind head) */}
    <path d="M8 33 C 7 18, 14 5, 27 9 C 34 11, 37 23, 35 30 Z" fill="#8596a8" />
    <path d="M11 30 C 11 20, 16 9, 25 13 C 30 15, 32 23, 31 28 Z" fill="#c4cdd8" />
    <path d="M92 33 C 93 18, 86 5, 73 9 C 66 11, 63 23, 65 30 Z" fill="#8596a8" />
    <path d="M89 30 C 89 20, 84 9, 75 13 C 70 15, 68 23, 69 28 Z" fill="#c4cdd8" />
    {/* Head */}
    <circle cx="50" cy="56" r="40" fill="#8596a8" />
    {/* Face centre lighter patch */}
    <ellipse cx="50" cy="60" rx="27" ry="23" fill="#a0b0bf" opacity="0.5" />
    {/* Chubby cheeks */}
    <ellipse cx="20" cy="67" rx="13" ry="10" fill="#a8b8c8" opacity="0.38" />
    <ellipse cx="80" cy="67" rx="13" ry="10" fill="#a8b8c8" opacity="0.38" />

    {/* Left eye */}
    {wink === 'left' ? <WinkLine cx={35} /> : <OpenEye cx={35} shineCx={32} />}
    {/* Right eye */}
    {wink === 'right' ? <WinkLine cx={65} /> : <OpenEye cx={65} shineCx={62} />}

    {/* Nose */}
    <path d="M46 64 L54 64 L50 68 Z" fill="#fca5a5" />
    {/* Mouth */}
    <path d="M50 68 Q44 72 40 70" stroke="#64748b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M50 68 Q56 72 60 70" stroke="#64748b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    {/* Whiskers */}
    <line x1="11" y1="63" x2="38" y2="64" stroke="#b8c4ce" strokeWidth="0.9" opacity="0.6" />
    <line x1="11" y1="67" x2="38" y2="67" stroke="#b8c4ce" strokeWidth="0.9" opacity="0.6" />
    <line x1="89" y1="63" x2="62" y2="64" stroke="#b8c4ce" strokeWidth="0.9" opacity="0.6" />
    <line x1="89" y1="67" x2="62" y2="67" stroke="#b8c4ce" strokeWidth="0.9" opacity="0.6" />
  </svg>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Ensure a newline exists before any non-Japanese translation appended to a sentence. */
function normalizeSentenceDisplay(text: string): string {
  if (!text) return text;
  // If the text already has a newline, preserve as-is (whitespace-pre-wrap handles it)
  if (text.includes('\n')) return text;
  // Insert a newline before a segment after 。 that contains no hiragana/katakana
  const hasKana = /[ぁ-ゖ゠-ヿ]/;
  return text.replace(/(。)([^\n])/g, (_, period, next) => {
    const remainder = text.slice(text.indexOf(period + next) + 1);
    return hasKana.test(remainder) ? period + next : period + '\n' + next;
  });
}

// ── Word card inside chat history ─────────────────────────────────────────────

const SpeakerIcon: React.FC<{ onClick: () => void; label: string; small?: boolean }> = ({ onClick, label, small }) => (
  <button
    onClick={onClick}
    className={`${small ? 'p-1' : 'p-1.5'} rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0`}
    aria-label={label}
  >
    <svg className={small ? 'w-3.5 h-3.5' : 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3M9 9H5a2 2 0 00-2 2v2a2 2 0 002 2h4l5 5V4L9 9z" />
    </svg>
  </button>
);

const WordCard: React.FC<{
  entry: ChatEntry;
  onSpeak: (text: string, lang: string) => void;
  onHeart: (entry: ChatEntry) => void;
}> = ({ entry, onSpeak, onHeart }) => {
  const { t } = useTranslation();
  return (
  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 text-left animate-fade-in-up">
    <div className="flex items-start justify-between gap-2 mb-1.5">
      <div className="flex items-center gap-1 min-w-0">
        <span className="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight truncate">{entry.word}</span>
        <SpeakerIcon onClick={() => onSpeak(entry.word, entry.wordLang)} label={t('chatbot.pronounce')} />
      </div>
      <button
        onClick={() => onHeart(entry)}
        className="p-1.5 rounded-lg hover:bg-pink-50 dark:hover:bg-pink-900/30 text-pink-400 transition-colors shrink-0"
        aria-label={t('chatbot.saveToGroup')}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </button>
    </div>
    {entry.translateEn && (
      <p className="text-xs text-blue-600 dark:text-blue-400 mb-0.5">{entry.translateEn}</p>
    )}
    {entry.translateCh && (
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{entry.translateCh}</p>
    )}
    {entry.sentence && (
      <div className="flex items-start gap-1 mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700">
        <p className="text-xs text-gray-700 dark:text-gray-300 italic leading-relaxed flex-1 whitespace-pre-wrap">
          {normalizeSentenceDisplay(entry.sentence)}
        </p>
        <SpeakerIcon onClick={() => onSpeak(cleanSentenceForTTS(entry.sentence!, entry.wordLang), entry.wordLang)} label={t('chatbot.pronounce')} small />
      </div>
    )}
    {entry.conjugations && (
      <div className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700">
        {entry.conjugations.split('\n').map((line, i) => {
          const colonIdx = line.indexOf(':');
          if (colonIdx === -1) return null;
          const label = line.substring(0, colonIdx).trim();
          const value = line.substring(colonIdx + 1).trim();
          return (
            <div key={i} className="flex items-baseline gap-1.5 text-xs leading-5">
              <span className="text-gray-400 dark:text-gray-500 shrink-0 min-w-[56px]">{label}</span>
              <span className="text-gray-800 dark:text-gray-200 font-medium">{value}</span>
            </div>
          );
        })}
      </div>
    )}
    <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1.5 text-right">
      {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </p>
  </div>
  );
};

// ── Main ChatBot component ────────────────────────────────────────────────────

const ChatBot: React.FC = () => {
  const { isLoggedIn } = useAuth();
  const { t } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [wink, setWink] = useState<WinkEye>('none');
  const winkSideRef = useRef<'left' | 'right'>('left');
  const [showLoginHint, setShowLoginHint] = useState(false);
  const [history, setHistory] = useState<ChatEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [heartEntry, setHeartEntry] = useState<ChatEntry | null>(null);

  const idleTimer = useRef<number | undefined>(undefined);
  const lastCopied = useRef('');
  const historyEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persist history
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  // Scroll to bottom on new entry or open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => historyEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }
  }, [history.length, isOpen]);

  // Alternate wink every 2s
  useEffect(() => {
    const id = setInterval(() => {
      const side = winkSideRef.current;
      setWink(side);
      setTimeout(() => setWink('none'), 220);
      winkSideRef.current = side === 'left' ? 'right' : 'left';
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // Idle shrink after 10s
  const resetIdle = useCallback(() => {
    setIsIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIsIdle(true), 10000);
  }, []);

  useEffect(() => {
    resetIdle();
    return () => window.clearTimeout(idleTimer.current);
  }, [resetIdle]);

  // Capture clipboard copy events — open modal and pre-fill input
  useEffect(() => {
    const onCopy = () => {
      const sel = window.getSelection()?.toString().trim();
      if (!sel) return;
      lastCopied.current = sel;
      if (!isOpen && isLoggedIn && localStorage.getItem('hw-chatbot-copy-trigger') !== 'false') {
        setInput(sel);
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 120);
      }
    };
    document.addEventListener('copy', onCopy);
    return () => document.removeEventListener('copy', onCopy);
  }, [isOpen, isLoggedIn]);

  // Listen for clear-chat from Header
  useEffect(() => {
    const onClear = () => {
      setHistory([]);
      localStorage.removeItem(HISTORY_KEY);
    };
    window.addEventListener('hw-clear-chat', onClear);
    return () => window.removeEventListener('hw-clear-chat', onClear);
  }, []);


  const handleIconClick = () => {
    resetIdle();
    if (!isLoggedIn) {
      setShowLoginHint(true);
      setTimeout(() => setShowLoginHint(false), 2000);
      return;
    }
    if (!isOpen) {
      // Auto-paste last copied text
      if (lastCopied.current && !input) {
        setInput(lastCopied.current);
      }
      setIsOpen(true);
      setTimeout(() => inputRef.current?.focus(), 120);
    } else {
      setIsOpen(false);
    }
  };

  const handleAction = async (type: 'translate' | 'sentence' | 'conjugation') => {
    const text = input.trim();
    if (!text || loading) return;
    setError('');
    setLoading(true);
    resetIdle();
    try {
      if (type === 'conjugation') {
        const result = await getVerbConjugation(text);
        const entry: ChatEntry = {
          id: (crypto.randomUUID?.() || Date.now().toString()),
          type: 'conjugation',
          input: text,
          word: result.word,
          translateEn: result.meaningEn,
          translateCh: result.meaningZh,
          wordLang: result.wordLang,
          conjugations: result.conjugations,
          timestamp: Date.now(),
        };
        setHistory(prev => [...prev, entry]);
        setInput('');
        return;
      }

      let result: QuickTranslateResult;
      result = await quickTranslate(text);

      let sentence: string | undefined;
      if (type === 'sentence') {
        sentence = await getSampleSentence(result.word, result.translateEn, 'en', result.wordLang);
      }

      const entry: ChatEntry = {
        id: (crypto.randomUUID?.() || Date.now().toString()),
        type,
        input: text,
        word: result.word,
        translateEn: result.translateEn,
        translateCh: result.translateCh,
        wordLang: result.wordLang,
        sentence,
        timestamp: Date.now(),
      };
      setHistory(prev => [...prev, entry]);
      setInput('');
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('NOT_A_VERB')) {
        setError(t('chatbot.notAVerb'));
      } else {
        setError(msg || t('chatbot.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSpeak = (text: string, lang: string) => {
    pronounceWord(text, lang);
  };

  const handleHeart = (entry: ChatEntry) => {
    setHeartEntry(entry);
  };

  // Build a Sentence-compatible object for AddToGroupModal
  const heartAsSentence: Sentence | null = heartEntry
    ? {
        id: 0,
        status: 1,
        word: heartEntry.word,
        translateEn: heartEntry.translateEn,
        translateCh: heartEntry.translateCh,
        sentence: heartEntry.sentence || '',
        language: heartEntry.wordLang,
        tableName: undefined,
      }
    : null;

  const modal = isOpen && isLoggedIn && (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 pointer-events-auto"
        onClick={() => setIsOpen(false)}
      />

      {/* Container-aligned positioning */}
      <div className="absolute inset-x-0 bottom-0 flex justify-end pointer-events-none">
        <div className="w-full max-w-2xl mx-auto px-4 flex justify-end">
          {/* Chat panel */}
          <div
            className="pointer-events-auto mb-[76px] w-[340px] max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden animate-chatbot-slide-up"
            style={{ maxHeight: 'min(540px, calc(100vh - 120px))' }}
            onClick={e => e.stopPropagation()}
          >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <KittenSVG wink={wink} size={28} />
            <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">{t('chatbot.title')}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY); }}
              className="p-1.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 transition-colors"
              aria-label={t('chatbot.clearHistory')}
              title={t('chatbot.clearHistory')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Chat history */}
        <div className="flex-1 overflow-y-auto px-3 pt-3 pb-4 space-y-2.5 scrollbar-hide">
          {history.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center text-gray-400 dark:text-gray-500 gap-2">
              <KittenSVG wink="none" size={48} />
              <p className="text-sm">{t('chatbot.emptyHint')}</p>
            </div>
          )}
          {history.map(entry => (
            <WordCard
              key={entry.id}
              entry={entry}
              onSpeak={handleSpeak}
              onHeart={handleHeart}
            />
          ))}
          {loading && (
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-gray-400 dark:text-gray-500">
              <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
              {t('chatbot.thinking')}
            </div>
          )}
          {error && (
            <p className="text-xs text-red-400 px-1">{error}</p>
          )}
          <div ref={historyEndRef} />
        </div>

        {/* Action buttons */}
        <div className="px-3 pt-2 pb-1 flex gap-2 shrink-0 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={() => handleAction('translate')}
            disabled={!input.trim() || loading}
            className="flex-1 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('chatbot.quickTranslate')}
          </button>
          <button
            onClick={() => handleAction('sentence')}
            disabled={!input.trim() || loading}
            className="flex-1 py-2 rounded-xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-semibold hover:bg-purple-100 dark:hover:bg-purple-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('chatbot.exampleSentence')}
          </button>
          <button
            onClick={() => handleAction('conjugation')}
            disabled={!input.trim() || loading}
            className="flex-1 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('chatbot.verbConjugation')}
          </button>
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-1 shrink-0">
          <div className="flex items-end gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => { setInput(e.target.value); resetIdle(); }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleAction('translate');
                }
              }}
              placeholder={t('chatbot.placeholder')}
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none leading-5 max-h-20"
              style={{ minHeight: '20px' }}
            />
            {input && (
              <button
                onClick={() => setInput('')}
                className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Floating button — pinned to the right edge of the max-w-2xl content container */}
      <div className="fixed bottom-20 left-0 right-0 z-50 pointer-events-none">
        <div className="max-w-2xl mx-auto px-4 flex justify-end">
          <div
            className="pointer-events-auto flex flex-col items-end gap-1.5 select-none"
            style={{
              transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease',
              transform: (isIdle && localStorage.getItem('hw-chatbot-idle-shrink') !== 'false') ? 'scale(0.55)' : 'scale(1)',
              opacity: (isIdle && localStorage.getItem('hw-chatbot-idle-shrink') !== 'false') ? 0.6 : 1,
              transformOrigin: 'bottom right',
            }}
          >
            {/* Login hint tooltip */}
            {showLoginHint && (
              <div className="chatbot-login-hint bg-gray-800 dark:bg-gray-700 text-white text-xs px-3 py-1.5 rounded-xl shadow-lg whitespace-nowrap">
                {t('chatbot.loginRequired')}
              </div>
            )}

            <button
              onClick={handleIconClick}
              className="rounded-full shadow-xl hover:shadow-2xl active:scale-95 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label={t('chatbot.title')}
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              <KittenSVG wink={wink} size={52} />
            </button>
          </div>
        </div>
      </div>

      {/* Chat modal via portal */}
      {ReactDOM.createPortal(modal, document.body)}

      {/* Add to group modal */}
      {heartAsSentence && (
        <AddToGroupModal
          word={heartAsSentence}
          onClose={() => setHeartEntry(null)}
        />
      )}
    </>
  );
};

export default ChatBot;
