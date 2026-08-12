import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchActiveSession } from '../../services/board.service';

/**
 * Stable entry point for whatever board is live right now — the URL to print on
 * a QR code, since /board/:id changes every session.
 *
 * Resolves the active session at visit time and forwards to it, or drops the
 * visitor on the home page when nothing is live. Redirects use `replace` so this
 * route leaves no history entry to bounce back through, and `fromLink` tells
 * BoardPage the visitor came from outside the app (see its back handler).
 *
 * Note this only ever forwards to a live session; /board/:id stays directly
 * reachable on its own for ended boards, which render read-only.
 */
const LiveBoardRedirect: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    // Fetched here rather than read from BoardContext: that context starts at
    // null and only fills in after its first poll, which would send every
    // visitor home before the real answer arrived.
    fetchActiveSession()
      .catch(() => null)
      .then((session) => {
        if (!alive) return;
        if (session && session.boardState === 'ACTIVE') {
          navigate(`/board/${session.id}`, { replace: true, state: { fromLink: true } });
        } else {
          navigate('/home', { replace: true });
        }
      });
    return () => { alive = false; };
  }, [navigate]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 items-center justify-center gap-3">
      <div className="w-8 h-8 border-[3px] border-blue-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
};

export default LiveBoardRedirect;
