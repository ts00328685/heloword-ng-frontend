import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useChallenge } from '../../contexts/ChallengeContext';
import { ChallengeRoom, GameFormat, createRoom } from '../../services/challenge.service';
import ChallengeRoomPage from './ChallengeRoomPage';

const GAME_TYPE_KEYS: Record<string, string> = {
  wordEnglishList: 'wordLists.wordEnglishList',
  wordGermanList: 'wordLists.wordGermanList',
  wordJapaneseList: 'wordLists.wordJapaneseList',
};

// Chevron icon — rotates 180° when open
const Chevron: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
    fill="none" stroke="currentColor" viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const { t } = useTranslation();
  const colors: Record<string, string> = {
    WAITING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    PLAYING: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    FINISHED: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  };
  const labelKeys: Record<string, string> = {
    WAITING: 'challenge.statusWaiting',
    PLAYING: 'challenge.statusLive',
    FINISHED: 'challenge.statusEnded',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors[status] ?? colors.WAITING}`}>
      {t(labelKeys[status] ?? 'challenge.statusWaiting')}
    </span>
  );
};

const RoomCard: React.FC<{ room: ChallengeRoom; onJoin: (id: string) => void }> = ({ room, onJoin }) => {
  const { t } = useTranslation();
  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${room.system
      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {room.system && <span className="text-xs font-bold text-blue-500">⭐ {t('challenge.system')}</span>}
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{room.name}</p>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {t(GAME_TYPE_KEYS[room.gameType] ?? 'wordLists.wordEnglishList')} · {t('challenge.players', { count: room.players.length })}
            {room.status === 'PLAYING' && ` · ${t('challenge.round')} ${room.currentRound}/${room.totalRounds}`}
          </p>
        </div>
        <StatusBadge status={room.status} />
      </div>
      {room.players.length > 0 && (
        <div className="flex gap-1 mb-2 flex-wrap">
          {room.players.slice(0, 5).map(p => (
            <span key={p.userId} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
              {p.displayName} {room.status !== 'WAITING' && <span className="text-blue-500 font-bold">{p.score}</span>}
            </span>
          ))}
        </div>
      )}
      <button
        onClick={() => onJoin(room.id)}
        className="w-full py-1.5 text-sm font-medium rounded-xl bg-blue-500 hover:bg-blue-600 text-white transition-colors"
      >
        {t('challenge.join')}
      </button>
    </div>
  );
};

/** Collapsible section wrapping a list of rooms. */
const RoomSection: React.FC<{
  title: string;
  icon: string;
  rooms: ChallengeRoom[];
  onJoin: (id: string) => void;
}> = ({ title, icon, rooms, onJoin }) => {
  const [open, setOpen] = useState(false);
  if (rooms.length === 0) return null;
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      {/* Header row — click to expand/collapse */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <span className="text-base">{icon}</span>
        <span className="flex-1 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
          {title}
        </span>
        <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400 mr-1">
          <span>👥</span>
          <span>{rooms.reduce((sum, r) => sum + r.players.length, 0)}</span>
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 bg-gray-50 dark:bg-gray-900/30">
          {rooms.map(room => (
            <div key={room.id} className="p-2">
              <RoomCard room={room} onJoin={onJoin} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CreateRoomModal: React.FC<{ onClose: () => void; onCreate: (room: ChallengeRoom) => void }> = ({ onClose, onCreate }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [gameType, setGameType] = useState('wordEnglishList');
  const [rounds, setRounds] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const room = await createRoom(name, gameType, rounds);
      if (room) onCreate(room);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">{t('challenge.createRoomTitle')}</h3>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('challenge.roomNameLabel')}</label>
        <input
          value={name} onChange={e => setName(e.target.value)}
          placeholder={t('challenge.roomNamePlaceholder')}
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('challenge.wordListLabel')}</label>
        <select
          value={gameType} onChange={e => setGameType(e.target.value)}
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {Object.entries(GAME_TYPE_KEYS).map(([k, tKey]) => <option key={k} value={k}>{t(tKey)}</option>)}
        </select>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('challenge.roundsLabel', { count: rounds })}</label>
        <input
          type="range" min={5} max={20} value={rounds} onChange={e => setRounds(Number(e.target.value))}
          className="w-full mb-4"
        />
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-500 border border-gray-200 dark:border-gray-700 rounded-xl">{t('social.cancel')}</button>
          <button onClick={handleCreate} disabled={loading} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded-xl">
            {loading ? '...' : t('challenge.create')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const ChallengePage: React.FC = () => {
  const { t } = useTranslation();
  const { isLoggedIn } = useAuth();
  const { rooms, currentRoom, joinRoomAction, leaveRoomAction } = useChallenge();
  const [showCreate, setShowCreate] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const navigate = useNavigate();

  if (currentRoom) {
    return <ChallengeRoomPage onLeave={leaveRoomAction} />;
  }

  // Sort all system rooms by difficulty within each group
  const DIFFICULTY_ORDER: Record<string, number> = { easy: 0, medium: 1, intermediate: 2, intermediary: 2, advanced: 3 };
  const roomDifficulty = (name: string) => {
    const lower = name.toLowerCase();
    for (const [key, rank] of Object.entries(DIFFICULTY_ORDER)) {
      if (lower.includes(key)) return rank;
    }
    return 99;
  };

  const sortedSystem = [...rooms.filter(r => r.system)].sort((a, b) => roomDifficulty(a.name) - roomDifficulty(b.name));
  const typingRooms     = sortedSystem.filter(r => !r.gameFormat || r.gameFormat === 'TYPING');
  const multiChoiceRooms = sortedSystem.filter(r => r.gameFormat === 'MULTI_CHOICE');
  const userRooms = rooms.filter(r => !r.system);
  const hasSystemRooms = typingRooms.length > 0 || multiChoiceRooms.length > 0;

  const handleJoin = async (roomId: string) => {
    setJoining(roomId);
    try {
      await joinRoomAction(roomId);
    } finally {
      setJoining(null);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 animate-page-enter">
      <Header title={t('nav.challenge')} />
      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full space-y-4">

        {isLoggedIn && (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full py-3 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-medium text-sm transition-colors shadow-sm"
          >
            {t('challenge.createRoom')}
          </button>
        )}

        {/* Featured system rooms — two collapsible panels */}
        {hasSystemRooms && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1 mb-2">
              {t('challenge.featured')}
            </p>
            <div className="space-y-2">
              <RoomSection
                title={t('challenge.typingRooms')}
                icon="⌨️"
                rooms={typingRooms}
                onJoin={handleJoin}
              />
              <RoomSection
                title={t('challenge.multiChoiceRooms')}
                icon="🔢"
                rooms={multiChoiceRooms}
                onJoin={handleJoin}
              />
            </div>
          </div>
        )}

        {/* User-created rooms */}
        {userRooms.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1 mb-2">
              {t('challenge.rooms')} ({userRooms.length})
            </p>
            <div className="space-y-2">
              {userRooms.map(room => <RoomCard key={room.id} room={room} onJoin={handleJoin} />)}
            </div>
          </div>
        )}

        {!hasSystemRooms && userRooms.length === 0 && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
            {t('challenge.noRooms')}
          </div>
        )}

        {/* Side Games */}
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1 mb-2">
            {t('scramble.sideGames')}
          </p>
          <div className="space-y-2">
            {[
              { path: '/challenge/scramble', state: { lang: 'en' }, icon: '🇬🇧', gradient: 'linear-gradient(135deg, #a29bfe, #6c5ce7)', titleKey: 'scramble.titleEn',        descKey: 'scramble.descEn' },
              { path: '/challenge/scramble', state: { lang: 'jp' }, icon: '🇯🇵', gradient: 'linear-gradient(135deg, #fd79a8, #e84393)', titleKey: 'scramble.titleJp',        descKey: 'scramble.descJp' },
              { path: '/challenge/quiz',     state: { gameType: 'en' }, icon: '🔤', gradient: 'linear-gradient(135deg, #00b894, #00cec9)', titleKey: 'multiChoice.titleEn', descKey: 'multiChoice.descEn' },
              { path: '/challenge/quiz',     state: { gameType: 'jp' }, icon: '🈶', gradient: 'linear-gradient(135deg, #fdcb6e, #e17055)', titleKey: 'multiChoice.titleJp', descKey: 'multiChoice.descJp' },
              { path: '/challenge/written',      state: { lang: 'en' }, icon: '✍️', gradient: 'linear-gradient(135deg, #00cec9, #0984e3)', titleKey: 'writtenTranslation.titleEn', descKey: 'writtenTranslation.descEn' },
              { path: '/challenge/written',      state: { lang: 'jp' }, icon: '📝', gradient: 'linear-gradient(135deg, #e17055, #d63031)', titleKey: 'writtenTranslation.titleJp', descKey: 'writtenTranslation.descJp' },
              { path: '/challenge/speaking',    state: {}, icon: '🎤', gradient: 'linear-gradient(135deg, #55efc4, #00b894)',   titleKey: 'speaking.title',   descKey: 'speaking.desc' },
              { path: '/challenge/speaking-jp', state: {}, icon: '🎙️', gradient: 'linear-gradient(135deg, #fd79a8, #e84393)',   titleKey: 'speaking.titleJp', descKey: 'speaking.descJp' },
            ].map(({ path, state, icon, gradient, titleKey, descKey }) => (
              <button
                key={titleKey}
                onClick={() => navigate(path, { state })}
                className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:border-blue-400 dark:hover:border-blue-600 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: gradient }}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t(titleKey)}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{t(descKey)}</p>
                </div>
                <span className="text-gray-300 dark:text-gray-600">›</span>
              </button>
            ))}
          </div>
        </div>

      </main>

      {showCreate && (
        <CreateRoomModal
          onClose={() => setShowCreate(false)}
          onCreate={(room) => { setShowCreate(false); joinRoomAction(room.id); }}
        />
      )}
    </div>
  );
};

export default ChallengePage;
