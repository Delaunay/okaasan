import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Flex, Heading, Text, VStack, HStack, Spinner, Badge,
  Button, Table, Input,
} from '@chakra-ui/react';
import {
  Search, Download, Copy, Check, ExternalLink,
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

const SearchPanel: React.FC = () => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [completedIndexers, setCompletedIndexers] = useState<string[]>([]);
  const abortRef = React.useRef<AbortController | null>(null);

  const doSearch = useCallback(async () => {
    if (!query.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setError(null);
    setResults([]);
    setCompletedIndexers([]);

    try {
      const params = new URLSearchParams({ q: query });
      if (category) params.set('categories', category);

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
      body.append('magnet_url', magnetOrUrl);
      await recipeAPI.request('/torrents/add', { method: 'POST', body });
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

      {error && (
        <Box mb={3} p={3} bg="var(--panel-red-bg)" border="1px solid" borderColor="var(--panel-red-border)" borderRadius="md">
          <Text fontSize="sm" color="var(--panel-red-text)">{error}</Text>
        </Box>
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
              {results.map((r, i) => (
                <Table.Row key={i}>
                  <Table.Cell maxW="400px">
                    <Text fontSize="sm" truncate title={r.title}>{r.title}</Text>
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
                          target="_blank"
                          rel="noopener noreferrer"
                          display="inline-flex"
                          alignItems="center"
                          justifyContent="center"
                          w="24px"
                          h="24px"
                          borderRadius="sm"
                          _hover={{ bg: 'var(--hover-bg)' }}
                          title="Download .torrent file"
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
                        {adding === r.title ? <Spinner size="xs" /> : <Download size={14} />}
                      </Button>
                    </HStack>
                  </Table.Cell>
                </Table.Row>
              ))}
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

const DiscoverPage: React.FC = () => {
  return (
    <Flex gap={0} align="stretch" height="calc(100vh - 100px)">
      <Box flex="1" minW="0" overflowY="auto" pr={4}>
        <Heading size="lg" mb={6}>Discover</Heading>

        <Box
          p={4}
          bg={cardBg}
          border="1px solid"
          borderColor={border}
          borderRadius="md"
        >
          <SearchPanel />
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
