import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { useChallenge } from '../../contexts/ChallengeContext';
import { ChallengeRoom } from '../../services/challenge.service';
import ChallengeRoomPage from './ChallengeRoomPage';
import { track } from '../../services/analytics.service';

const GAME_TYPE_KEYS: Record<string, string> = {
  wordEnglishList: 'wordLists.wordEnglishList',
  wordGermanList: 'wordLists.wordGermanList',
  wordJapaneseList: 'wordLists.wordJapaneseList',
};

// Chevron icon — rotates 180° when open
const Chevron: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    className={`w-4 h-4 text-ink-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
    fill="none" stroke="currentColor" viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const { t } = useTranslation();
  const colors: Record<string, string> = {
    WAITING: 'bg-accent-soft text-accent',
    PLAYING: 'bg-success-soft text-success',
    FINISHED: 'bg-ink/5 text-ink-muted',
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
      ? 'bg-accent-soft border-line '
      : 'bg-surface border-line '}`}>
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {room.system && <span className="text-xs font-semibold text-accent">{t('challenge.system')}</span>}
            <p className="text-sm font-semibold text-ink truncate">{room.name}</p>
          </div>
          <p className="text-xs text-ink-faint">
            {t(GAME_TYPE_KEYS[room.gameType] ?? 'wordLists.wordEnglishList')} · {t('challenge.players', { count: room.players.length })}
            {room.status === 'PLAYING' && ` · ${t('challenge.round')} ${room.currentRound}/${room.totalRounds}`}
          </p>
        </div>
        <StatusBadge status={room.status} />
      </div>
      {room.players.length > 0 && (
        <div className="flex gap-1 mb-2 flex-wrap">
          {room.players.slice(0, 5).map(p => (
            <span key={p.userId} className="text-xs bg-ink/5 text-ink-muted px-2 py-0.5 rounded-full">
              {p.displayName} {room.status !== 'WAITING' && <span className="text-accent font-semibold">{p.score}</span>}
            </span>
          ))}
        </div>
      )}
      <button
        onClick={() => onJoin(room.id)}
        className="w-full py-1.5 text-sm font-medium rounded-xl bg-ink hover:bg-ink/85 text-paper transition-colors"
      >
        {t('challenge.join')}
      </button>
    </div>
  );
};

/** Collapsible section wrapping a list of rooms. */
const RoomSection: React.FC<{
  title: string;
  rooms: ChallengeRoom[];
  onJoin: (id: string) => void;
}> = ({ title, rooms, onJoin }) => {
  const [open, setOpen] = useState(false);
  if (rooms.length === 0) return null;
  return (
    <div className="rounded-md border border-line overflow-hidden">
      {/* Header row — click to expand/collapse */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-surface hover:bg-paper transition-colors"
      >
        <span className="flex-1 text-left text-xs font-semibold text-ink-muted uppercase tracking-wide">
          {title}
        </span>
        <span className="flex items-center gap-1 text-[10px] font-medium text-ink-faint mr-1">
          <span>{rooms.reduce((sum, r) => sum + r.players.length, 0)}</span>
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="border-t border-line divide-y divide-line bg-paper">
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


interface GameEntry {
  path: string;
  state: object;
  titleKey: string;
  descKey: string;
}

/** Thin line icon per game kind, keyed by route. */
const GAME_ICON: Record<string, string> = {
  '/challenge/scramble': 'M3.75 6.75h16.5M3.75 12h10.5m-10.5 5.25h16.5',
  '/challenge/quiz': 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  '/challenge/written': 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z',
  '/challenge/speaking': 'M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z',
  '/challenge/kirby': 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111 5.518.442c.499.04.701.663.321.988l-4.204 3.602 1.285 5.385a.562.562 0 01-.84.61L12 16.75l-4.725 2.887a.562.562 0 01-.84-.61l1.285-5.386-4.204-3.6a.562.562 0 01.321-.989l5.518-.442L11.48 3.5z',
};

const GameRow: React.FC<{ path: string; title: string; desc: string; onClick: () => void }> = ({ path, title, desc, onClick }) => (
  <button onClick={onClick} className="w-full flex items-center gap-4 px-4 py-3.5 bg-surface hover:bg-paper transition-colors text-left group">
    <svg className="w-5 h-5 text-ink-faint group-hover:text-accent transition-colors shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={GAME_ICON[path.replace('-jp', '')] ?? GAME_ICON['/challenge/quiz']} />
    </svg>
    <div className="flex-1 min-w-0">
      <p className="text-sm text-ink">{title}</p>
      <p className="text-xs text-ink-muted truncate mt-0.5">{desc}</p>
    </div>
    <svg className="w-4 h-4 text-ink-faint shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  </button>
);

const GameSection: React.FC<{
  label: string;
  title: string;
  games: GameEntry[];
  onNavigate: (path: string, opts: { state: object }) => void;
  t: (key: string) => string;
}> = ({ label, title, games, onNavigate, t }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-md border border-line overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-surface hover:bg-paper transition-colors"
      >
        <span className="text-[10px] font-medium tracking-label text-ink-faint w-5">{label}</span>
        <span className="flex-1 text-left text-sm text-ink">{title}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="border-t border-line divide-y divide-line">
          {games.map(({ path, state, titleKey, descKey }) => (
            <GameRow
              key={titleKey}
              path={path}
              title={t(titleKey)}
              desc={t(descKey)}
              onClick={() => { track('BUTTON', 'challenge_start:' + path); onNavigate(path, { state }); }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ChallengePage: React.FC = () => {
  const { t } = useTranslation();
  const { rooms, currentRoom, joinRoomAction, leaveRoomAction } = useChallenge();
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

  const handleJoin = (roomId: string) => joinRoomAction(roomId);

  return (
    <div className="flex flex-col min-h-screen bg-paper animate-page-enter">
      <Header title={t('nav.challenge')} />
      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full space-y-4">

        {/* Featured system rooms — two collapsible panels */}
        {hasSystemRooms && (
          <div>
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide px-1 mb-2">
              {t('challenge.featured')}
            </p>
            <div className="space-y-2">
              <RoomSection
                title={t('challenge.typingRooms')}
                rooms={typingRooms}
                onJoin={handleJoin}
              />
              <RoomSection
                title={t('challenge.multiChoiceRooms')}
                rooms={multiChoiceRooms}
                onJoin={handleJoin}
              />
            </div>
          </div>
        )}

        {/* User-created rooms */}
        {userRooms.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide px-1 mb-2">
              {t('challenge.rooms')} ({userRooms.length})
            </p>
            <div className="space-y-2">
              {userRooms.map(room => <RoomCard key={room.id} room={room} onJoin={handleJoin} />)}
            </div>
          </div>
        )}

        {!hasSystemRooms && userRooms.length === 0 && (
          <div className="text-center py-12 text-ink-faint text-sm">
            {t('challenge.noRooms')}
          </div>
        )}


        {/* Side Games */}
        <div>
          <p className="font-serif text-[17px] text-ink mb-3">
            {t('scramble.sideGames')}
          </p>
          <div className="space-y-2">
            {[
              {
                sectionLabel: 'EN',
                sectionTitle: t('challenge.englishGames'),
                games: [
                  { path: '/challenge/scramble', state: { lang: 'en' },       titleKey: 'scramble.titleEn',              descKey: 'scramble.descEn' },
                  { path: '/challenge/quiz',     state: { gameType: 'en' },   titleKey: 'multiChoice.titleEn',           descKey: 'multiChoice.descEn' },
                  { path: '/challenge/written',  state: { lang: 'en' },       titleKey: 'writtenTranslation.titleEn',    descKey: 'writtenTranslation.descEn' },
                  { path: '/challenge/speaking', state: {},                   titleKey: 'speaking.title',               descKey: 'speaking.desc' },
                ],
              },
              {
                sectionLabel: 'JP',
                sectionTitle: t('challenge.japaneseGames'),
                games: [
                  { path: '/challenge/scramble',    state: { lang: 'jp' },     titleKey: 'scramble.titleJp',             descKey: 'scramble.descJp' },
                  { path: '/challenge/quiz',        state: { gameType: 'jp' }, titleKey: 'multiChoice.titleJp',          descKey: 'multiChoice.descJp' },
                  { path: '/challenge/written',     state: { lang: 'jp' },     titleKey: 'writtenTranslation.titleJp',   descKey: 'writtenTranslation.descJp' },
                  { path: '/challenge/speaking-jp', state: {},                 titleKey: 'speaking.titleJp',            descKey: 'speaking.descJp' },
                ],
              },
            ].map(({ sectionLabel, sectionTitle, games }) => (
              <GameSection key={sectionTitle} label={sectionLabel} title={sectionTitle} games={games} onNavigate={navigate} t={t} />
            ))}
          </div>
        </div>

        {/* External Links — desktop only, collapsed by default */}
        <ExternalLinksSection onNavigate={navigate} />

      </main>

    </div>
  );
};

interface ExternalLinksSection {
  onNavigate: (path: string) => void;
}

const ExternalLinksSection: React.FC<ExternalLinksSection> = ({ onNavigate }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="hidden md:block">
      <div className="rounded-md border border-line overflow-hidden">
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-surface hover:bg-paper transition-colors"
        >
          <span className="flex-1 text-left text-sm text-ink">
            外站連結
          </span>
          <Chevron open={open} />
        </button>
        {open && (
          <div className="border-t border-line">
            <GameRow path="/challenge/kirby" title="Kirby Adventure" desc="3-stage platformer · earn your high score" onClick={() => onNavigate('/challenge/kirby')} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChallengePage;
