import { useCallback, useState } from 'react';

/** Pairs with <DiscoverModal /> — call open(title, extra) from a "Find in
 * Downloads" button instead of navigating to /torrents/discover, so the
 * user can pick a torrent without leaving the page they were browsing. */
export function useDiscoverModal() {
  const [query, setQuery] = useState<string | null>(null);

  const open = useCallback((title: string, extra?: string | number) => {
    setQuery(extra ? `${title} ${extra}` : title);
  }, []);

  const close = useCallback(() => setQuery(null), []);

  return { query, open, close };
}
