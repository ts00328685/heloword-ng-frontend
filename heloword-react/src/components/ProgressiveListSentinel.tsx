import React from 'react';

interface Props {
  sentinelRef: React.RefObject<HTMLDivElement>;
  hasMore: boolean;
}

/**
 * Sentinel element placed after a progressively-loaded list.
 * When scrolled into view it triggers the IntersectionObserver in
 * useProgressiveList to reveal the next page of items.
 */
const ProgressiveListSentinel: React.FC<Props> = ({ sentinelRef, hasMore }) => (
  <div ref={sentinelRef} className="h-10 flex items-center justify-center mt-2">
    {hasMore && (
      <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
    )}
  </div>
);

export default ProgressiveListSentinel;
