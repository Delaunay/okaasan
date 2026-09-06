import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Flex, Heading, Text, VStack, HStack, Spinner, Badge,
  Button, Table, Input,
} from '@chakra-ui/react';
import {
  Search, Copy, Check, ExternalLink, Plus,
} from 'lucide-react';
import { recipeAPI } from '../../services/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface SearchResultItem {
  title: string;
  infohash: string | null;
  magnet: string | null;
  download_url: string | null;
  seeders: number | null;
  leechers: number | null;
  size: number | null;
  category: string | null;
  indexer: string | null;
  indexer_id: string | null;
  details_url: string | null;
  published_at: string | null;
  // Parsed by the backend release-title parser (category-aware).
  season: number | null;
  episode: number | null;
  episode_end: number | null;
  year: number | null;
  resolution: string | null;
  codec: string | null;
  source: string | null;
  audio: string | null;
  group: string | null;
  studio: string | null;
  release_date: string | null;
  normalized_title: string | null;
}

interface DownloadedKey {
  infohash: string | null;
  normalized_title: string | null;
  season: number | null;
  episode: number | null;
}

function groupKey(r: SearchResultItem): string {
  // Season+episode is a much stronger identity signal than the leftover
  // title text — different indexers format the same episode's title just
  // differently enough (word order, abbreviations, punctuation) that
  // requiring normalized_title to also match made grouping look random.
  // A search on this page is already scoped to one show, so S/E alone is
  // enough to say "this is the same episode".
  if (r.season != null && r.episode != null) {
    return `SE|S${r.season}E${r.episode}`;
  }
  // Studio-branded, date-coded releases (e.g. "Studio.26.08.29.Title") have
  // no season/episode — studio+date is their equivalent strong identity.
  if (r.release_date) {
    return `DATE|${r.studio ?? ''}|${r.release_date}`;
  }
  // Movies: no episode identity, so the title still has to carry the key —
  // but pair it with year to tell same-titled movies from different years apart.
  if (r.year != null) {
    return `YEAR|${r.normalized_title ?? r.title}|${r.year}`;
  }
  return `TITLE|${r.normalized_title ?? r.title}`;
}

interface QueryTarget {
  season: number | null;
  episode: number | null;
}

const QUERY_SE_RE = /\bS(\d{1,2})E(\d{1,3})\b/i;
const QUERY_XSERIES_RE = /\b(\d{1,2})x(\d{2,3})\b/i;
const QUERY_SEASON_ONLY_RE = /\bS(\d{1,2})\b(?!\s*E)/i;

// If the user typed a specific episode ("...S01E05") or season pack
// ("...S01") into the search box, we know exactly what they're after and can
// filter out results the parser didn't confidently match to that target.
function parseQueryTarget(q: string): QueryTarget {
  let m = QUERY_SE_RE.exec(q);
  if (m) return { season: Number(m[1]), episode: Number(m[2]) };
  m = QUERY_XSERIES_RE.exec(q);
  if (m) return { season: Number(m[1]), episode: Number(m[2]) };
  m = QUERY_SEASON_ONLY_RE.exec(q);
  if (m) return { season: Number(m[1]), episode: null };
  return { season: null, episode: null };
}

function matchesQueryTarget(r: SearchResultItem, target: QueryTarget): boolean {
  if (target.season == null) return true;
  if (r.season !== target.season) return false;
  if (target.episode != null && r.episode !== target.episode) return false;
  return true;
}

// Downloaded-release records don't persist `year` (only title/season/episode),
// so matching against them needs a key that leaves it out — otherwise a
// movie's groupKey (which includes year) would never match.
function downloadMatchKey(r: { normalized_title: string | null; title?: string; season: number | null; episode: number | null }): string {
  return `${r.normalized_title ?? r.title}|S${r.season ?? ''}E${r.episode ?? ''}`;
}

type IndexedResult = { r: SearchResultItem; i: number };
type ResultGroup = { key: string; mode: 'episode' | 'resolution'; items: IndexedResult[] };

// When a specific episode/season target is known (parsed from the search
// query), grouping "by episode" is moot — everything shown already is that
// episode, so group by resolution instead to compare quality options.
function buildGroups(items: IndexedResult[], mode: 'episode' | 'resolution', doGroup: boolean): ResultGroup[] {
  if (!doGroup) {
    return items.map(item => ({ key: `${mode}-${item.i}`, mode, items: [item] }));
  }
  const keyFn = mode === 'resolution'
    ? (r: SearchResultItem) => r.resolution ?? '__unknown__'
    : groupKey;
  const order: string[] = [];
  const byKey = new Map<string, IndexedResult[]>();
  for (const item of items) {
    const key = keyFn(item.r);
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(item);
  }
  return order.map(key => ({ key: `${mode}-${key}`, mode, items: byKey.get(key)! }));
}

interface IndexerInfo {
  id: string;
  name: string;
  language: string;
  type: string;
  enabled: boolean;
  configured: boolean;
}

// ── Torznab category helpers ─────────────────────────────────────────────────

const SEARCH_CATEGORIES = [
  { value: '', label: 'All' },
  { value: '5000', label: 'TV' },
  { value: '2000', label: 'Movies' },
  { value: '5070', label: 'Anime' },
  { value: '3000', label: 'Audio / Music' },
  { value: '7000', label: 'Books' },
  { value: '4000', label: 'PC / Games' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Deprioritize (not exclude) obvious low-quality releases so they don't
// crowd out healthy, legitimate results with the same or fewer seeders.
const LOW_QUALITY_RE = /\b(cam|hdcam|ts|telesync|scr(?:eener)?|workprint|sample)\b/i;

function rankScore(r: SearchResultItem): number {
  const seeders = r.seeders ?? 0;
  const leechers = r.leechers ?? 0;
  const base = seeders * 1000 + leechers;
  return LOW_QUALITY_RE.test(r.title) ? base * 0.05 : base;
}

function timeAgo(isoDate: string | null): string {
  if (!isoDate) return '—';
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

// ── Subcomponents ────────────────────────────────────────────────────────────

const cardBg = 'var(--card-bg)';
const border = 'var(--border-color)';
const mutedText = 'var(--muted-text)';

interface SearchPanelProps {
  initialQuery?: string;
  onAdded?: () => void;
}

const SearchPanel: React.FC<SearchPanelProps> = ({ initialQuery, onAdded }) => {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [category, setCategory] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [completedIndexers, setCompletedIndexers] = useState<string[]>([]);
  const [cacheAgeSeconds, setCacheAgeSeconds] = useState<number | null>(null);
  const [groupReleases, setGroupReleases] = useState(true);
  const [hideDownloaded, setHideDownloaded] = useState(false);
  const [downloadedInfohashes, setDownloadedInfohashes] = useState<Set<string>>(new Set());
  const [downloadedKeys, setDownloadedKeys] = useState<Set<string>>(new Set());
  const [searchedQuery, setSearchedQuery] = useState('');
  const [showNonMatching, setShowNonMatching] = useState(false);
  const sortedResults = useMemo(
    () => [...results].sort((a, b) => rankScore(b) - rankScore(a)),
    [results]
  );
  const visibleResults = useMemo(() => {
    if (!hideDownloaded) return sortedResults;
    return sortedResults.filter(r => {
      if (r.infohash && downloadedInfohashes.has(r.infohash)) return false;
      return !downloadedKeys.has(downloadMatchKey(r));
    });
  }, [sortedResults, hideDownloaded, downloadedInfohashes, downloadedKeys]);

  const queryTarget = useMemo(() => parseQueryTarget(searchedQuery), [searchedQuery]);
  const hasTarget = queryTarget.season != null;

  // Each grouped item carries its stable index into `visibleResults` so the
  // existing `copied`/`adding` state (keyed by that index) keeps working.
  // When the query names a specific episode/season, split results into what
  // matched that target (grouped by resolution) and what didn't (hidden by
  // default, revealed — grouped normally — via "Show non-matching results").
  const { matchingGroups, nonMatchingGroups, nonMatchingCount } = useMemo(() => {
    const indexed = visibleResults.map((r, i) => ({ r, i }));
    if (!hasTarget) {
      return {
        matchingGroups: buildGroups(indexed, 'episode', groupReleases),
        nonMatchingGroups: [] as ResultGroup[],
        nonMatchingCount: 0,
      };
    }
    const matching: IndexedResult[] = [];
    const nonMatching: IndexedResult[] = [];
    for (const item of indexed) {
      (matchesQueryTarget(item.r, queryTarget) ? matching : nonMatching).push(item);
    }
    return {
      matchingGroups: buildGroups(matching, 'resolution', groupReleases),
      nonMatchingGroups: showNonMatching ? buildGroups(nonMatching, 'episode', groupReleases) : [],
      nonMatchingCount: nonMatching.length,
    };
  }, [visibleResults, groupReleases, hasTarget, queryTarget, showNonMatching]);
  const abortRef = React.useRef<AbortController | null>(null);

  const fetchDownloaded = useCallback(async () => {
    try {
      const rows = await recipeAPI.request<DownloadedKey[]>('/discover/downloaded');
      const hashes = new Set<string>();
      const keys = new Set<string>();
      for (const row of rows) {
        if (row.infohash) hashes.add(row.infohash);
        if (row.normalized_title) keys.add(downloadMatchKey(row));
      }
      setDownloadedInfohashes(hashes);
      setDownloadedKeys(keys);
    } catch { /* ignore */ }
  }, []);

  const toggleHideDownloaded = () => {
    const next = !hideDownloaded;
    setHideDownloaded(next);
    if (next) fetchDownloaded();
  };

  const logDownload = useCallback((item: SearchResultItem, action: 'download_file' | 'add_qbittorrent') => {
    const body = {
      infohash: item.infohash,
      normalized_title: item.normalized_title,
      season: item.season,
      episode: item.episode,
      title: item.title,
      action,
    };
    recipeAPI.request('/discover/downloaded', { method: 'POST', body: JSON.stringify(body) }).catch(() => { /* best-effort */ });
    // Reflect immediately in this session without waiting on a refetch.
    if (item.infohash) setDownloadedInfohashes(prev => new Set(prev).add(item.infohash!));
    setDownloadedKeys(prev => new Set(prev).add(downloadMatchKey(item)));
  }, []);

  const doSearch = useCallback(async (queryOverride?: string, opts?: { force?: boolean }) => {
    const effectiveQuery = queryOverride ?? query;
    if (!effectiveQuery.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setError(null);
    setResults([]);
    setCompletedIndexers([]);
    setCacheAgeSeconds(null);
    setSearchedQuery(effectiveQuery);
    setShowNonMatching(false);

    try {
      const params = new URLSearchParams({ q: effectiveQuery });
      if (category) params.set('categories', category);
      if (opts?.force) params.set('force', 'true');

      const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
      const response = await fetch(`${apiBase}/discover/search/stream?${params}`, {
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Search failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.error) {
              setError(payload.error);
            } else if (payload.cached) {
              setResults(payload.results || []);
              setCacheAgeSeconds(payload.age_seconds ?? 0);
            } else if (payload.done) {
              // stream complete
            } else if (payload.results) {
              setResults(prev => [...prev, ...payload.results]);
              if (payload.indexer) {
                setCompletedIndexers(prev => [...prev, payload.indexer]);
              }
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Search failed');
      }
    } finally {
      setSearching(false);
    }
  }, [query, category]);

  // Landing here with e.g. /torrents/discover?q=Some+Show — pre-fill and
  // run the search immediately, so linking in from another page "just works".
  // When embedded in a modal, initialQuery is passed directly instead.
  const [searchParams] = useSearchParams();
  const autoSearchedRef = useRef(false);
  useEffect(() => {
    if (autoSearchedRef.current) return;
    const q = initialQuery ?? searchParams.get('q');
    if (q) {
      autoSearchedRef.current = true;
      setQuery(q);
      doSearch(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') doSearch();
  };

  const addTorrent = async (item: SearchResultItem) => {
    let magnetOrUrl = item.magnet || item.download_url;

    if (!magnetOrUrl && item.details_url && item.indexer_id) {
      setAdding(item.title);
      try {
        const resolved = await recipeAPI.request<{ link: string }>(
          '/discover/resolve',
          { method: 'POST', body: JSON.stringify({ indexer_id: item.indexer_id, details_url: item.details_url }) }
        );
        magnetOrUrl = resolved.link;
      } catch {
        setAdding(null);
        return;
      }
    }

    if (!magnetOrUrl) return;

    setAdding(item.title);
    try {
      const body = new FormData();
      body.append('url', magnetOrUrl);
      await recipeAPI.request('/torrents/add', { method: 'POST', body });
      logDownload(item, 'add_qbittorrent');
      onAdded?.();
    } catch (err) {
      console.error('Failed to add torrent:', err);
    } finally {
      setAdding(null);
    }
  };

  const copyRowData = async (item: SearchResultItem, index: number) => {
    const lines: string[] = [item.title];
    if (item.magnet) lines.push(item.magnet);
    else if (item.infohash) lines.push(`magnet:?xt=urn:btih:${item.infohash}&dn=${encodeURIComponent(item.title)}`);
    else if (item.download_url) lines.push(item.download_url);
    if (item.size) lines.push(`Size: ${formatBytes(item.size)}`);
    if (item.seeders != null) lines.push(`Seeders: ${item.seeders}`);
    if (item.category) lines.push(`Category: ${item.category}`);
    if (item.indexer) lines.push(`Indexer: ${item.indexer}`);
    if (item.infohash) lines.push(`Hash: ${item.infohash}`);
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(index);
    setTimeout(() => setCopied(prev => prev === index ? null : prev), 2000);
  };

  const renderGroup = (group: ResultGroup) => {
    const first = group.items[0].r;
    const releaseLabel = group.mode === 'resolution'
      ? (first.resolution || 'Unknown quality')
      : (first.season != null && first.episode != null
        ? `S${String(first.season).padStart(2, '0')}E${String(first.episode).padStart(2, '0')}`
        : first.release_date || (first.year != null ? String(first.year) : null));
    return (
      <React.Fragment key={group.key}>
        {groupReleases && group.items.length > 1 && (
          <Table.Row bg="var(--hover-bg)">
            <Table.Cell colSpan={8}>
              <Flex align="center" justify="space-between">
                <Text fontSize="xs" fontWeight="700" truncate>
                  {releaseLabel && <Badge size="xs" variant="solid" mr={2}>{releaseLabel}</Badge>}
                  {group.mode === 'episode' && (first.normalized_title || first.title)}
                </Text>
                <Badge fontSize="xs" variant="subtle">{group.items.length} variants</Badge>
              </Flex>
            </Table.Cell>
          </Table.Row>
        )}
        {group.items.map(({ r, i }) => (
          <Table.Row key={i}>
            <Table.Cell maxW="400px">
              <Text fontSize="sm" truncate title={r.title}>{r.title}</Text>
              {(r.resolution || r.source || r.codec || r.group || r.studio) && (
                <HStack gap={1} mt={1} wrap="wrap">
                  {r.resolution && <Badge size="xs" variant="surface">{r.resolution}</Badge>}
                  {r.source && <Badge size="xs" variant="surface">{r.source}</Badge>}
                  {r.codec && <Badge size="xs" variant="surface">{r.codec}</Badge>}
                  {r.group && <Badge size="xs" variant="surface" colorPalette="purple">{r.group}</Badge>}
                  {r.studio && <Badge size="xs" variant="surface" colorPalette="teal">{r.studio}</Badge>}
                </HStack>
              )}
            </Table.Cell>
            <Table.Cell textAlign="center">
              <Text fontSize="sm" color="green.500" fontWeight="600">{r.seeders ?? '—'}</Text>
            </Table.Cell>
            <Table.Cell textAlign="center">
              <Text fontSize="sm" color="red.400">{r.leechers ?? '—'}</Text>
            </Table.Cell>
            <Table.Cell textAlign="right">
              <Text fontSize="sm" color={mutedText}>{formatBytes(r.size || 0)}</Text>
            </Table.Cell>
            <Table.Cell>
              {r.category ? <Badge fontSize="xs" variant="outline">{r.category}</Badge> : <Text fontSize="xs" color={mutedText}>—</Text>}
            </Table.Cell>
            <Table.Cell>
              <Badge fontSize="xs" variant="subtle">{r.indexer || '—'}</Badge>
            </Table.Cell>
            <Table.Cell>
              <Text fontSize="xs" color={mutedText}>{timeAgo(r.published_at)}</Text>
            </Table.Cell>
            <Table.Cell textAlign="center">
              <HStack gap={0} justify="center">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => copyRowData(r, i)}
                  title="Copy torrent info"
                >
                  {copied === i ? <Check size={14} color="green" /> : <Copy size={14} />}
                </Button>
                {(r.download_url || r.magnet) && (
                  <Box
                    as="a"
                    href={r.download_url || r.magnet || '#'}
                    // magnet: isn't a navigable URL — target="_blank" would
                    // leave behind a blank tab once the browser hands off
                    // to the torrent client, so only use it for real
                    // .torrent file URLs.
                    {...(r.download_url ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    onClick={() => logDownload(r, 'download_file')}
                    display="inline-flex"
                    alignItems="center"
                    justifyContent="center"
                    w="24px"
                    h="24px"
                    borderRadius="sm"
                    _hover={{ bg: 'var(--hover-bg)' }}
                    title={r.download_url ? 'Download .torrent file' : 'Open magnet link'}
                  >
                    <ExternalLink size={14} />
                  </Box>
                )}
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={adding === r.title || (!r.magnet && !r.download_url && !r.details_url)}
                  onClick={() => addTorrent(r)}
                  title="Add to qBittorrent"
                >
                  {adding === r.title ? <Spinner size="xs" /> : <Plus size={14} />}
                </Button>
              </HStack>
            </Table.Cell>
          </Table.Row>
        ))}
      </React.Fragment>
    );
  };

  return (
    <Box>
      <Flex gap={2} mb={4}>
        <Input
          flex="1"
          placeholder="Search torrents..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          bg="var(--input-bg)"
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{
            padding: '0 12px',
            borderRadius: '6px',
            border: `1px solid ${border}`,
            background: cardBg,
            minWidth: '120px',
          }}
        >
          {SEARCH_CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <Button
          onClick={doSearch}
          disabled={!query.trim() || searching}
          colorPalette="blue"
        >
          {searching ? <Spinner size="sm" /> : <Search size={16} />}
          Search
        </Button>
      </Flex>

      <Flex gap={4} mb={3}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: mutedText, cursor: 'pointer' }}>
          <input type="checkbox" checked={groupReleases} onChange={e => setGroupReleases(e.target.checked)} />
          {hasTarget ? 'Group by resolution' : 'Group releases'}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: mutedText, cursor: 'pointer' }}>
          <input type="checkbox" checked={hideDownloaded} onChange={toggleHideDownloaded} />
          Hide downloaded
        </label>
      </Flex>

      {hasTarget && (
        <Flex align="center" justify="space-between" mb={3} p={2} bg={cardBg} border="1px solid" borderColor={border} borderRadius="md">
          <Text fontSize="xs" color={mutedText}>
            Only showing results for S{String(queryTarget.season).padStart(2, '0')}
            {queryTarget.episode != null ? `E${String(queryTarget.episode).padStart(2, '0')}` : ''}
            {nonMatchingCount > 0 && ` — ${nonMatchingCount} other result${nonMatchingCount !== 1 ? 's' : ''} hidden`}
          </Text>
          {nonMatchingCount > 0 && (
            <Button size="xs" variant="ghost" onClick={() => setShowNonMatching(v => !v)}>
              {showNonMatching ? 'Hide them again' : 'Show them anyway'}
            </Button>
          )}
        </Flex>
      )}

      {error && (
        <Box mb={3} p={3} bg="var(--panel-red-bg)" border="1px solid" borderColor="var(--panel-red-border)" borderRadius="md">
          <Text fontSize="sm" color="var(--panel-red-text)">{error}</Text>
        </Box>
      )}

      {cacheAgeSeconds != null && (
        <Flex align="center" justify="space-between" mb={3} p={2} bg="var(--panel-blue-bg, var(--card-bg))" border="1px solid" borderColor={border} borderRadius="md">
          <Text fontSize="xs" color={mutedText}>
            Showing cached results from {Math.max(1, Math.round(cacheAgeSeconds / 60))}m ago
          </Text>
          <Button size="xs" variant="ghost" onClick={() => doSearch(query, { force: true })}>
            Search again
          </Button>
        </Flex>
      )}

      {(searching || completedIndexers.length > 0) && (
        <Flex align="center" gap={2} mb={3}>
          {searching && <Spinner size="xs" />}
          <Text fontSize="xs" color={mutedText}>
            {completedIndexers.length} indexer{completedIndexers.length !== 1 ? 's' : ''} responded
            {results.length > 0 && ` — ${results.length} results`}
            {searching && '...'}
          </Text>
        </Flex>
      )}

      {results.length > 0 && (
        <Box overflowX="auto">
          <Table.Root size="sm" variant="line">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Title</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="center">S</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="center">L</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="right">Size</Table.ColumnHeader>
                <Table.ColumnHeader>Cat</Table.ColumnHeader>
                <Table.ColumnHeader>Indexer</Table.ColumnHeader>
                <Table.ColumnHeader>Age</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="center" width="100px"></Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {matchingGroups.map(renderGroup)}
              {nonMatchingGroups.length > 0 && (
                <Table.Row>
                  <Table.Cell colSpan={8}>
                    <Text fontSize="xs" fontWeight="700" color={mutedText} pt={3} pb={1}>
                      Other results — didn't match S{String(queryTarget.season).padStart(2, '0')}
                      {queryTarget.episode != null ? `E${String(queryTarget.episode).padStart(2, '0')}` : ''}
                    </Text>
                  </Table.Cell>
                </Table.Row>
              )}
              {nonMatchingGroups.map(renderGroup)}
            </Table.Body>
          </Table.Root>
        </Box>
      )}

      {!searching && results.length === 0 && completedIndexers.length > 0 && (
        <Text fontSize="sm" color={mutedText} textAlign="center" py={8}>
          No results from {completedIndexers.length} indexers. Try a different search term.
        </Text>
      )}
    </Box>
  );
};



const IndexerPanel: React.FC = () => {
  const [indexers, setIndexers] = useState<IndexerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [langFilter, setLangFilter] = useState<string>('');

  const fetchIndexers = useCallback(async () => {
    try {
      const data = await recipeAPI.request<IndexerInfo[]>('/discover/indexers');
      setIndexers(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIndexers(); }, [fetchIndexers]);

  const toggleIndexer = async (idx: IndexerInfo) => {
    setToggling(idx.id);
    try {
      await recipeAPI.request('/discover/indexers/configure', {
        method: 'POST',
        body: JSON.stringify({
          indexer_id: idx.id,
          enabled: !idx.enabled,
          config: {},
        }),
      });
      await fetchIndexers();
    } catch (err) {
      console.error('Failed to toggle indexer:', err);
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <Flex justify="center" py={8}><Spinner size="sm" /></Flex>
    );
  }

  const enabled = indexers.filter(i => i.enabled);
  const available = indexers.filter(i => !i.enabled);

  const baseLang = (lang: string) => (lang || '').split('-')[0].toLowerCase();
  const langName = (code: string) => {
    try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; }
    catch { return code; }
  };

  const langCounts = new Map<string, number>();
  for (const i of available) {
    const base = baseLang(i.language);
    if (base) langCounts.set(base, (langCounts.get(base) || 0) + 1);
  }
  const languages = Array.from(langCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  const lowerFilter = filter.toLowerCase();
  const filtered = available.filter(i => {
    if (lowerFilter && !i.name.toLowerCase().includes(lowerFilter) && !i.id.toLowerCase().includes(lowerFilter)) return false;
    if (langFilter && baseLang(i.language) !== langFilter) return false;
    return true;
  });

  return (
    <VStack align="stretch" gap={0} height="100%">
      <Box px={3} pt={3} pb={2}>
        <Flex justify="space-between" align="center" mb={2}>
          <Text fontSize="xs" fontWeight="700" color={mutedText}>INDEXERS</Text>
          <Badge fontSize="xs" variant="subtle">{indexers.length}</Badge>
        </Flex>
        <Input
          size="sm"
          placeholder="Filter by name..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          bg="var(--input-bg)"
          mb={1}
        />
        <select
          value={langFilter}
          onChange={e => setLangFilter(e.target.value)}
          style={{
            width: '100%',
            fontSize: '12px',
            padding: '4px 6px',
            borderRadius: '4px',
            border: `1px solid var(--border-color)`,
            background: 'var(--input-bg)',
            color: 'inherit',
          }}
        >
          <option value="">All languages ({languages.length})</option>
          {languages.map(([code, count]) => (
            <option key={code} value={code}>{langName(code)} ({count})</option>
          ))}
        </select>
      </Box>

      {enabled.length > 0 && (
        <Box px={3} pb={2}>
          <Text fontSize="xs" fontWeight="600" color="green.500" mb={1}>
            ENABLED ({enabled.length})
          </Text>
          <VStack align="stretch" gap={0}>
            {enabled.map(idx => (
              <Flex
                key={idx.id}
                align="center"
                justify="space-between"
                py="5px"
                px={2}
                cursor="pointer"
                borderRadius="sm"
                _hover={{ bg: 'var(--hover-bg)' }}
                onClick={() => toggleIndexer(idx)}
                opacity={toggling === idx.id ? 0.5 : 1}
              >
                <Text fontSize="xs" truncate flex="1">{idx.name}</Text>
                <Box w={2} h={2} borderRadius="full" bg="green.400" flexShrink={0} ml={2} />
              </Flex>
            ))}
          </VStack>
        </Box>
      )}

      <Box
        flex="1"
        overflowY="auto"
        px={3}
        pb={3}
        borderTop={enabled.length > 0 ? '1px solid' : undefined}
        borderColor={border}
        pt={enabled.length > 0 ? 2 : 0}
      >
        <Text fontSize="xs" fontWeight="600" color={mutedText} mb={1}>
          AVAILABLE ({filtered.length})
        </Text>
        <VStack align="stretch" gap={0}>
          {filtered.map(idx => (
            <Flex
              key={idx.id}
              align="center"
              justify="space-between"
              py="5px"
              px={2}
              cursor="pointer"
              borderRadius="sm"
              _hover={{ bg: 'var(--hover-bg)' }}
              onClick={() => toggleIndexer(idx)}
              opacity={toggling === idx.id ? 0.5 : 1}
            >
              <Text fontSize="xs" truncate flex="1">{idx.name}</Text>
              <Text fontSize="xs" color={mutedText} flexShrink={0} ml={2}>{idx.language}</Text>
            </Flex>
          ))}
        </VStack>
      </Box>
    </VStack>
  );
};

// ── Main page ────────────────────────────────────────────────────────────────

interface DiscoverPageProps {
  /** Pre-fills and auto-runs a search — used when opened from another page
   * (a "Find in Downloads" button) instead of the standalone /torrents/discover
   * route's own ?q= query param. */
  initialQuery?: string;
  /** True when rendered inside DiscoverModal rather than as its own routed
   * page — swaps the full-viewport height for one that fits a dialog, and
   * drops the page heading. */
  embedded?: boolean;
  /** Called after a torrent is successfully added — DiscoverModal uses this
   * to close itself so the user can get back to browsing. */
  onAdded?: () => void;
}

const DiscoverPage: React.FC<DiscoverPageProps> = ({ initialQuery, embedded, onAdded }) => {
  return (
    <Flex gap={0} align="stretch" height={embedded ? '100%' : 'calc(100vh - 100px)'}>
      <Box flex="1" minW="0" overflowY="auto" pr={4}>
        {!embedded && <Heading size="lg" mb={6}>Discover</Heading>}

        <Box
          p={4}
          bg={cardBg}
          border="1px solid"
          borderColor={border}
          borderRadius="md"
        >
          <SearchPanel initialQuery={initialQuery} onAdded={onAdded} />
        </Box>
      </Box>

      <Box
        width="240px"
        flexShrink={0}
        bg={cardBg}
        border="1px solid"
        borderColor={border}
        borderRadius="md"
        overflow="hidden"
        display="flex"
        flexDirection="column"
      >
        <IndexerPanel />
      </Box>
    </Flex>
  );
};

export default DiscoverPage;
