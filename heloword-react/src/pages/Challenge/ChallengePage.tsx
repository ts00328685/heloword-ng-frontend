import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import { useChallenge } from '../../contexts/ChallengeContext';
import { ChallengeRoom, createRoom } from '../../services/challenge.service';
import ChallengeRoomPage from './ChallengeRoomPage';

const GAME_TYPE_LABELS: Record<string, string> = {
  wordEnglishList: 'English Words',
  wordGermanList: 'German Words',
  wordJapaneseList: 'Japanese Words',
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    WAITING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    PLAYING: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    FINISHED: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  };
  const labels: Record<string, string> = { WAITING: 'Waiting', PLAYING: 'Live', FINISHED: 'Ended' };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors[status] ?? colors.WAITING}`}>
      {labels[status] ?? status}
    </span>
  );
};

const RoomCard: React.FC<{ room: ChallengeRoom; onJoin: (id: string) => void }> = ({ room, onJoin }) => (
  <div className={`rounded-2xl border p-3 shadow-sm ${room.system
    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
    <div className="flex items-start gap-2 mb-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {room.system && <span className="text-xs font-bold text-blue-500">⭐ SYSTEM</span>}
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{room.name}</p>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {GAME_TYPE_LABELS[room.gameType] ?? room.gameType} · {room.players.length} player{room.players.length !== 1 ? 's' : ''}
          {room.status === 'PLAYING' && ` · Round ${room.currentRound}/${room.totalRounds}`}
        </p>
      </div>
      <StatusBadge status={room.status} />
    </div>
    {/* Top 3 players */}
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
      Join
    </button>
  </div>
);

const CreateRoomModal: React.FC<{ onClose: () => void; onCreate: (room: ChallengeRoom) => void }> = ({ onClose, onCreate }) => {
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Create Room</h3>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Room Name (optional)</label>
        <input
          value={name} onChange={e => setName(e.target.value)}
          placeholder="My Room"
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Word List</label>
        <select
          value={gameType} onChange={e => setGameType(e.target.value)}
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {Object.entries(GAME_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Rounds: {rounds}</label>
        <input
          type="range" min={5} max={20} value={rounds} onChange={e => setRounds(Number(e.target.value))}
          className="w-full mb-4"
        />
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-500 border border-gray-200 dark:border-gray-700 rounded-xl">Cancel</button>
          <button onClick={handleCreate} disabled={loading} className="flex-1 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded-xl">
            {loading ? '...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ChallengePage: React.FC = () => {
  const { t } = useTranslation();
  const { isLoggedIn } = useAuth();
  const { rooms, currentRoom, joinRoomAction, leaveRoomAction } = useChallenge();
  const [showCreate, setShowCreate] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  if (currentRoom) {
    return <ChallengeRoomPage onLeave={leaveRoomAction} />;
  }

  const systemRoom = rooms.find(r => r.system);
  const userRooms = rooms.filter(r => !r.system);

  const handleJoin = async (roomId: string) => {
    setJoining(roomId);
    try {
      await joinRoomAction(roomId);
    } finally {
      setJoining(null);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title={t('nav.challenge')} />
      <main className="flex-1 pb-20 px-4 pt-4 max-w-2xl mx-auto w-full space-y-4">

        {isLoggedIn && (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full py-3 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white font-medium text-sm transition-colors shadow-sm"
          >
            + Create Room
          </button>
        )}

        {systemRoom && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1 mb-2">Featured</p>
            <RoomCard room={systemRoom} onJoin={handleJoin} />
          </div>
        )}

        {userRooms.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1 mb-2">
              Rooms ({userRooms.length})
            </p>
            <div className="space-y-2">
              {userRooms.map(room => <RoomCard key={room.id} room={room} onJoin={handleJoin} />)}
            </div>
          </div>
        )}

        {rooms.length <= 1 && !systemRoom && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
            No rooms yet. Create one!
          </div>
        )}
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
