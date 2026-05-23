import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Flex, Heading, Text, HStack, VStack, Spinner, Badge,
  Button, Table, IconButton,
} from '@chakra-ui/react';
import {
  Play, Square, Radio, Globe, Hash, Trash2,
  ChevronDown, ChevronRight, ChevronLeft,
  File, Link, Users, Eye, Copy, Check,
} from 'lucide-react';
import { recipeAPI } from '../../services/api';
import { useNotifications } from '../../hooks/useNotifications';

interface CrawlerStatus {
  running: boolean;
  discovered: number;
  metadata_resolved: number;
  resolve_pending: number;
}

interface TorrentFile {
  path: string;
  size: number;
}

interface DHTResult {
  id: number;
  infohash: string;
  name: string | null;
  size: number | null;
  files_count: number | null;
  peers_count: number | null;
  hits: number | null;
  magnet: string;
  metadata_resolved: boolean;
  discovered_at: string | null;
  files?: TorrentFile[];
}

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

const mutedText = 'var(--muted-text)';
const cardBg = 'var(--card-bg)';
const border = 'var(--border-color)';
const PAGE_SIZE = 50;

const MagnetLink: React.FC<{ magnet: string }> = ({ magnet }) => {
  const [copied, setCopied] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(magnet, '_blank');
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(magnet);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = magnet;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <HStack gap={0}>
      <IconButton
        size="xs"
        variant="ghost"
        onClick={handleClick}
        title="Open magnet link"
        aria-label="Open magnet link"
      >
        <Link size={14} />
      </IconButton>
      <IconButton
        size="xs"
        variant="ghost"
        onClick={handleCopy}
        title={copied ? 'Copied!' : 'Copy magnet link'}
        aria-label="Copy magnet link"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </IconButton>
    </HStack>
  );
};

const FileList: React.FC<{ torrentId: number }> = ({ torrentId }) => {
  const [files, setFiles] = useState<TorrentFile[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await recipeAPI.request<DHTResult>(`/discover/crawler/detail/${torrentId}`);
        setFiles(data.files || []);
      } catch {
        setFiles([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [torrentId]);

  if (loading) return <Spinner size="xs" />;
  if (!files || files.length === 0) {
    return <Text fontSize="xs" color={mutedText} fontStyle="italic">No file information available</Text>;
  }

  return (
    <VStack align="stretch" gap={0} pl={2} borderLeft="2px solid" borderColor={border}>
      {files.map((f, i) => (
        <Flex key={i} gap={2} align="center" py={0.5}>
          <File size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
          <Text fontSize="xs" flex="1" wordBreak="break-all">{f.path}</Text>
          <Text fontSize="xs" color={mutedText} flexShrink={0}>{formatBytes(f.size)}</Text>
        </Flex>
      ))}
    </VStack>
  );
};

const TorrentRow: React.FC<{
  r: DHTResult;
  onDelete: (id: number) => void;
}> = ({ r, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const canExpand = r.metadata_resolved && (r.files_count ?? 0) > 0;

  return (
    <>
      <Table.Row
        cursor={canExpand ? 'pointer' : 'default'}
        onClick={() => canExpand && setExpanded(!expanded)}
        _hover={canExpand ? { bg: 'var(--hover-bg, rgba(128,128,128,0.06))' } : undefined}
      >
        <Table.Cell width="24px" pr={0}>
          {canExpand ? (
            expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <Box width="14px" />
          )}
        </Table.Cell>
        <Table.Cell maxW="400px">
          <Text fontSize="sm" truncate>
            {r.name || (
              <Text as="span" fontSize="xs" fontFamily="mono" color={mutedText}>
                {r.infohash.slice(0, 20)}...
              </Text>
            )}
          </Text>
        </Table.Cell>
        <Table.Cell textAlign="right">
          <Text fontSize="sm" color={mutedText}>{formatBytes(r.size || 0)}</Text>
        </Table.Cell>
        <Table.Cell textAlign="right">
          <Text fontSize="sm" color={mutedText}>{r.files_count ?? '—'}</Text>
        </Table.Cell>
        <Table.Cell textAlign="right">
          <HStack gap={1} justify="flex-end">
            <Users size={12} style={{ opacity: 0.5 }} />
            <Text fontSize="sm" color={mutedText}>{r.peers_count ?? '—'}</Text>
          </HStack>
        </Table.Cell>
        <Table.Cell textAlign="right">
          <HStack gap={1} justify="flex-end">
            <Eye size={12} style={{ opacity: 0.5 }} />
            <Text fontSize="sm" color={mutedText}>{r.hits ?? 1}</Text>
          </HStack>
        </Table.Cell>
        <Table.Cell>
          <Text fontSize="xs" color={mutedText}>{timeAgo(r.discovered_at)}</Text>
        </Table.Cell>
        <Table.Cell textAlign="center">
          <HStack gap={0} justify="center">
            <MagnetLink magnet={r.magnet} />
            <IconButton
              size="xs"
              variant="ghost"
              colorPalette="red"
              onClick={(e) => { e.stopPropagation(); onDelete(r.id); }}
              title="Delete torrent"
              aria-label="Delete torrent"
            >
              <Trash2 size={14} />
            </IconButton>
          </HStack>
        </Table.Cell>
      </Table.Row>
      {expanded && (
        <Table.Row>
          <Table.Cell colSpan={8} py={3} px={6}>
            <FileList torrentId={r.id} />
          </Table.Cell>
        </Table.Row>
      )}
    </>
  );
};

interface RateSample { time: number; value: number; }
const RATE_WINDOW_MS = 60_000;

function useRate(current: number): number {
  const samples = useRef<RateSample[]>([]);

  useEffect(() => {
    if (current <= 0) {
      samples.current = [];
      return;
    }
    const now = Date.now();
    samples.current.push({ time: now, value: current });
    const cutoff = now - RATE_WINDOW_MS * 2;
    samples.current = samples.current.filter(s => s.time >= cutoff);
  }, [current]);

  const s = samples.current;
  if (s.length < 2) return 0;
  const oldest = s[0];
  const newest = s[s.length - 1];
  const elapsed = (newest.time - oldest.time) / 60_000;
  if (elapsed < 0.05) return 0;
  return (newest.value - oldest.value) / elapsed;
}

const CrawlerPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get('filter') || 'all';
  const resolvedOnly = filter === 'resolved';
  const page = parseInt(searchParams.get('page') || '0', 10);

  const setResolvedOnly = useCallback((v: boolean) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('filter', v ? 'resolved' : 'all');
      next.delete('page');
      return next;
    });
  }, [setSearchParams]);

  const setPage = useCallback((p: number | ((prev: number) => number)) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      const newPage = typeof p === 'function' ? p(parseInt(prev.get('page') || '0', 10)) : p;
      if (newPage === 0) next.delete('page');
      else next.set('page', String(newPage));
      return next;
    });
  }, [setSearchParams]);

  const [status, setStatus] = useState<CrawlerStatus>({ running: false, discovered: 0, metadata_resolved: 0, resolve_pending: 0 });
  const [results, setResults] = useState<DHTResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const hashRate = useRate(status.discovered);
  const resolveRate = useRate(status.metadata_resolved);

  const fetchResults = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(p * PAGE_SIZE),
      });
      if (resolvedOnly) params.set('resolved_only', 'true');
      const data = await recipeAPI.request<{ total: number; results: DHTResult[] }>(
        `/discover/crawler/results?${params}`
      );
      setResults(data.results || []);
      setTotal(data.total || 0);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [resolvedOnly, page]);

  useNotifications(useCallback((event) => {
    if (event.type !== 'dht_crawler_status') return;

    setStatus({
      running: event.running ?? false,
      discovered: event.discovered ?? 0,
      metadata_resolved: event.metadata_resolved ?? 0,
      resolve_pending: event.resolve_pending ?? 0,
    });

    setTotal(event.discovered ?? 0);

    const recent = event.recent as DHTResult[] | undefined;
    if (!recent || recent.length === 0) return;

    setResults(prev => {
      const byHash = new Map<string, number>();
      prev.forEach((r, i) => byHash.set(r.infohash, i));

      const updated = [...prev];
      let changed = false;

      for (const entry of recent) {
        const idx = byHash.get(entry.infohash);
        if (idx !== undefined) {
          updated[idx] = { ...updated[idx], ...entry, id: updated[idx].id || entry.id };
          changed = true;
        }
      }

      return changed ? updated : prev;
    });
  }, []));

  useEffect(() => {
    recipeAPI.request<CrawlerStatus>('/discover/crawler/status')
      .then(setStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchResults(page);
  }, [fetchResults, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggle = async () => {
    setToggling(true);
    try {
      if (status.running) {
        await recipeAPI.request('/discover/crawler/stop', { method: 'POST' });
      } else {
        await recipeAPI.request('/discover/crawler/start', { method: 'POST' });
      }
    } catch (err) {
      console.error('Toggle crawler failed:', err);
    } finally {
      setToggling(false);
    }
  };

  const deleteTorrent = async (id: number) => {
    try {
      await recipeAPI.request(`/discover/crawler/${id}`, { method: 'DELETE' });
      setResults(prev => prev.filter(r => r.id !== id));
      setTotal(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const cleanup = async () => {
    if (!confirm('Remove all unresolved torrents from the database?')) return;
    setCleaning(true);
    try {
      const data = await recipeAPI.request<{ deleted: number }>('/discover/crawler/cleanup', { method: 'POST' });
      console.log(`Cleaned up ${data.deleted} unresolved entries`);
      await fetchResults(0);
      setPage(0);
    } catch (err) {
      console.error('Cleanup failed:', err);
    } finally {
      setCleaning(false);
    }
  };

  return (
    <Box>
      <Heading size="lg" mb={6}>DHT Crawler</Heading>

      <Box
        p={4}
        bg={cardBg}
        border="1px solid"
        borderColor={border}
        borderRadius="md"
        mb={6}
      >
        <Flex justify="space-between" align="center" mb={4}>
          <HStack gap={3}>
            <Button
              size="sm"
              onClick={toggle}
              disabled={toggling}
              colorPalette={status.running ? 'red' : 'green'}
            >
              {toggling ? <Spinner size="xs" /> : status.running ? <Square size={14} /> : <Play size={14} />}
              {status.running ? 'Stop' : 'Start'}
            </Button>
            <Badge colorPalette={status.running ? 'green' : 'gray'} variant="subtle">
              <Radio size={10} />
              {status.running ? 'Running' : 'Stopped'}
            </Badge>
          </HStack>
          <HStack gap={4} flexWrap="wrap">
            <HStack gap={1}>
              <Hash size={14} />
              <Text fontSize="sm">{status.discovered.toLocaleString()} hashes</Text>
              {hashRate > 0 && (
                <Text fontSize="xs" color={mutedText}>({hashRate.toFixed(1)}/min)</Text>
              )}
            </HStack>
            <HStack gap={1}>
              <Globe size={14} />
              <Text fontSize="sm">{status.metadata_resolved.toLocaleString()} resolved</Text>
              {resolveRate > 0 && (
                <Text fontSize="xs" color={mutedText}>({resolveRate.toFixed(1)}/min)</Text>
              )}
            </HStack>
            {status.resolve_pending > 0 && (
              <HStack gap={1}>
                <Spinner size="xs" />
                <Text fontSize="sm">{status.resolve_pending} pending</Text>
              </HStack>
            )}
          </HStack>
        </Flex>

        <Text fontSize="xs" color={mutedText}>
          The DHT crawler discovers infohashes from peer queries and announcements on the BitTorrent network.
          <b> Peers</b> = number of peers found during metadata lookup.
          <b> Hits</b> = how many times this infohash was seen in DHT traffic (higher = more popular).
          Click a resolved torrent to see its file list.
        </Text>
      </Box>

      <Box
        p={4}
        bg={cardBg}
        border="1px solid"
        borderColor={border}
        borderRadius="md"
      >
        <Flex justify="space-between" align="center" mb={3}>
          <HStack gap={2}>
            <Button size="xs" variant={!resolvedOnly ? 'solid' : 'outline'} onClick={() => setResolvedOnly(false)}>
              All ({total})
            </Button>
            <Button size="xs" variant={resolvedOnly ? 'solid' : 'outline'} onClick={() => setResolvedOnly(true)}>
              Resolved only
            </Button>
          </HStack>
          <HStack gap={2}>
            <Button size="xs" variant="ghost" onClick={() => fetchResults(page)} disabled={loading}>
              {loading ? <Spinner size="xs" /> : 'Refresh'}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              colorPalette="red"
              onClick={cleanup}
              disabled={cleaning}
              title="Remove all unresolved torrents from the database"
            >
              {cleaning ? <Spinner size="xs" /> : <Trash2 size={14} />}
              Cleanup
            </Button>
          </HStack>
        </Flex>

        {results.length > 0 ? (
          <>
            <Box overflowX="auto">
              <Table.Root size="sm" variant="line">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader width="24px" pr={0}></Table.ColumnHeader>
                    <Table.ColumnHeader>Name / Hash</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Size</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Files</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Peers</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="right">Hits</Table.ColumnHeader>
                    <Table.ColumnHeader>Discovered</Table.ColumnHeader>
                    <Table.ColumnHeader textAlign="center" width="100px"></Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {results.map(r => (
                    <TorrentRow key={r.id || r.infohash} r={r} onDelete={deleteTorrent} />
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>

            {totalPages > 1 && (
              <Flex justify="center" align="center" gap={3} mt={4}>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft size={14} /> Prev
                </Button>
                <Text fontSize="sm" color={mutedText}>
                  Page {page + 1} of {totalPages}
                </Text>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next <ChevronRight size={14} />
                </Button>
              </Flex>
            )}
          </>
        ) : (
          <Text fontSize="sm" color={mutedText} textAlign="center" py={8}>
            {status.running ? 'Crawling the DHT network... results will appear here as infohashes are discovered.' : 'Start the crawler to discover torrents on the DHT network.'}
          </Text>
        )}
      </Box>
    </Box>
  );
};

export default CrawlerPage;
