import { useEffect, useRef, useState } from 'react';

interface UseProgressiveListReturn<T> {
  visible: T[];
  hasMore: boolean;
  sentinelRef: React.RefObject<HTMLDivElement>;
}

/**
 * Progressively renders a large list by revealing pageSize items at a time,
 * using an IntersectionObserver on a sentinel element placed after the list.
 *
 * @param items    The full filtered array to paginate.
 * @param pageSize Number of items to reveal per scroll step (default 50).
 */
export function useProgressiveList<T>(
  items: T[],
  pageSize = 50,
): UseProgressiveListReturn<T> {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset to first page when the list length changes (covers query/filter changes).
  // Depends on items.length rather than items reference to avoid
  // infinite loops when filtered is not memoized.
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [items.length, pageSize]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + pageSize, items.length));
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [items.length, pageSize]);

  return {
    visible: items.slice(0, visibleCount),
    hasMore: visibleCount < items.length,
    sentinelRef,
  };
}
