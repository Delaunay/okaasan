import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box, Flex, Heading, Text, VStack, HStack, Spinner, Badge,
  Button, Table, Textarea,
} from '@chakra-ui/react';
import {
  Download, Upload, Play, Pause, Trash2, Plus, Power, PowerOff,
  RefreshCw, CheckCircle, ArrowDownToLine, Settings, Clock,
  Clipboard, X, Shield, ShieldOff, ShieldAlert, Link,
} from 'lucide-react';
import { recipeAPI } from '../../services/api';
import { useNotifications } from '../../hooks/useNotifications';

const MAGNET_RE = /^magnet:\?xt=urn:btih:[a-zA-Z0-9]+/;

interface TorrentInfo {
  hash: string;
  name: string;
  size: number;
  progress: number;
  dlspeed: number;
  upspeed: number;
  state: string;
  category: string;
  eta: number;
  added_on: number;
  completion_on: number;
  save_path: string;
}

interface TransferInfo {
  dl_info_speed: number;
  up_info_speed: number;
  dl_info_data: number;
  up_info_data: number;
}

interface CompletedDownload {
  id: number;
  torrent_hash: string;
  name: string;
  category: string;
  media_type: string;
  completed_at: string | null;
  catalog_id: number | null;
}

interface QbtStatus {
  process: { running: boolean; pid: number | null; binary: string | null };
  connected: boolean;
  transfer: TransferInfo | null;
  version: string | null;
  connection_error: string | null;
}

interface VpnStatus {
  connected: boolean;
  server: string | null;
  country: string | null;
  city: string | null;
  ip: string | null;
  protocol: string | null;
  interface: string | null;
  provider: string;
  monitor_active: boolean;
  last_event: { event: string; message: string; timestamp: string } | null;
  error?: string;
}

interface Destinations {
  [key: string]: string;
}

const CATEGORIES = [
  { value: 'tv', label: 'TV Show' },
  { value: 'movie', label: 'Movie' },
  { value: 'anime', label: 'Anime' },
  { value: 'music', label: 'Music' },
  { value: 'books', label: 'Books' },
  { value: 'games', label: 'Games' },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatEta(seconds: number): string {
  if (seconds <= 0 || seconds >= 8640000) return '∞';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function stateLabel(state: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    downloading: { label: 'Downloading', color: 'blue' },
    uploading: { label: 'Seeding', color: 'green' },
    pausedDL: { label: 'Paused', color: 'orange' },
    pausedUP: { label: 'Paused (done)', color: 'gray' },
    stalledDL: { label: 'Stalled', color: 'orange' },
    stalledUP: { label: 'Seeding', color: 'green' },
    queuedDL: { label: 'Queued', color: 'gray' },
    queuedUP: { label: 'Queued', color: 'gray' },
    checkingDL: { label: 'Checking', color: 'purple' },
    checkingUP: { label: 'Checking', color: 'purple' },
    error: { label: 'Error', color: 'red' },
    missingFiles: { label: 'Missing', color: 'red' },
    stoppedDL: { label: 'Stopped', color: 'gray' },
    stoppedUP: { label: 'Complete', color: 'green' },
  };
  return map[state] || { label: state, color: 'gray' };
}

const TorrentsPage: React.FC = () => {
  const [status, setStatus] = useState<QbtStatus | null>(null);
  const [torrents, setTorrents] = useState<TorrentInfo[]>([]);
  const [history, setHistory] = useState<CompletedDownload[]>([]);
  const [destinations, setDestinations] = useState<Destinations>({});
  const [loading, setLoading] = useState(true);
  const [magnetUrl, setMagnetUrl] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('tv');
  const [adding, setAdding] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clipboardMagnet, setClipboardMagnet] = useState<string | null>(null);
  const [vpn, setVpn] = useState<VpnStatus | null>(null);
  const [vpnConnecting, setVpnConnecting] = useState(false);
  const lastDismissedRef = useRef<string | null>(null);

  // ── WebSocket: receive live status updates from the server ───
  useNotifications(useCallback((event) => {
    if (event.type !== 'downloads_status') return;
    const { qbt, vpn: vpnData, torrents: torrentList } = event as any;
    if (qbt) setStatus(qbt as QbtStatus);
    if (vpnData) setVpn(vpnData as VpnStatus);
    if (torrentList) setTorrents(torrentList as TorrentInfo[]);
  }, []));

  // ── HTTP fetches for infrequent data + post-action refresh ───
  const fetchHistory = useCallback(async () => {
    try {
      const data = await recipeAPI.request<{ history: CompletedDownload[] }>('/torrents/history');
      setHistory(data.history || []);
    } catch {
      setHistory([]);
    }
  }, []);

  const fetchDestinations = useCallback(async () => {
    try {
      const data = await recipeAPI.request<{ destinations: Destinations }>('/torrents/destinations');
      setDestinations(data.destinations || {});
    } catch { /* ignore */ }
  }, []);

  const fetchInitial = useCallback(async () => {
    await Promise.all([fetchHistory(), fetchDestinations()]);
    setLoading(false);
  }, [fetchHistory, fetchDestinations]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  useEffect(() => {
    const checkClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText();
        const trimmed = text.trim();
        if (MAGNET_RE.test(trimmed) && trimmed !== magnetUrl && trimmed !== lastDismissedRef.current) {
          setClipboardMagnet(trimmed);
        }
      } catch {
        // Permission denied or clipboard empty — ignore
      }
    };
    window.addEventListener('focus', checkClipboard);
    checkClipboard();
    return () => window.removeEventListener('focus', checkClipboard);
  }, [magnetUrl]);

  const useMagnetFromClipboard = () => {
    if (clipboardMagnet) {
      setMagnetUrl(clipboardMagnet);
      setClipboardMagnet(null);
      lastDismissedRef.current = null;
    }
  };

  const dismissClipboard = () => {
    lastDismissedRef.current = clipboardMagnet;
    setClipboardMagnet(null);
  };

  const connectVpn = async () => {
    setError(null);
    setVpnConnecting(true);
    try {
      await recipeAPI.request('/vpn/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p2p: true }),
      });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setVpnConnecting(false);
    }
  };

  const disconnectVpn = async () => {
    setError(null);
    try {
      await recipeAPI.request('/vpn/disconnect', { method: 'POST' });
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const bindQbtToVpn = async () => {
    setError(null);
    try {
      await recipeAPI.request('/vpn/bind-qbt', { method: 'POST' });
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const startQbt = async () => {
    setError(null);
    try {
      await recipeAPI.request('/torrents/start', { method: 'POST' });
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const stopQbt = async () => {
    setError(null);
    try {
      await recipeAPI.request('/torrents/stop', { method: 'POST' });
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const addTorrent = async () => {
    if (!magnetUrl.trim()) return;
    setAdding(true);
    try {
      const formData = new FormData();
      formData.append('url', magnetUrl.trim());
      formData.append('category', selectedCategory);
      await recipeAPI.request('/torrents/add', {
        method: 'POST',
        body: formData,
      });
      setMagnetUrl('');
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setAdding(false); }
  };

  const removeTorrent = async (hash: string, deleteFiles: boolean = false) => {
    try {
      await recipeAPI.request('/torrents/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash, delete_files: deleteFiles }),
      });
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  const pauseTorrent = async (hash: string) => {
    try {
      await recipeAPI.request('/torrents/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash }),
      });
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  const resumeTorrent = async (hash: string) => {
    try {
      await recipeAPI.request('/torrents/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash }),
      });
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  const syncCategories = async () => {
    setError(null);
    try {
      await recipeAPI.request('/torrents/sync-categories', { method: 'POST' });
      await fetchDestinations();
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  const setupHook = async () => {
    setError(null);
    try {
      await recipeAPI.request('/torrents/setup-hook', { method: 'POST' });
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  const isConnected = status?.connected ?? false;
  const isRunning = (status?.process?.running ?? false) || isConnected;
  const transfer = status?.transfer;
  const vpnUp = vpn?.connected ?? false;
  const vpnKilledQbt = vpn?.last_event?.event === 'qbt_killed';

  return (
    <VStack gap={6} align="stretch" p={4}>
      {/* Header */}
      <HStack justify="space-between" flexWrap="wrap">
        <HStack>
          <ArrowDownToLine size={24} />
          <Heading size="lg" color="var(--heading-color)">Downloads</Heading>
          {status?.version && (
            <Badge colorPalette="gray">qBittorrent {status.version}</Badge>
          )}
        </HStack>
        <HStack gap={2}>
          <Button size="sm" variant="outline" onClick={() => setShowConfig(!showConfig)}>
            <Settings size={14} />
          </Button>
          {isRunning ? (
            <Button size="sm" colorPalette="red" variant="outline" onClick={stopQbt}>
              <PowerOff size={14} />
              <Text ml={1}>Stop</Text>
            </Button>
          ) : (
            <Button size="sm" colorPalette="green" variant="outline" onClick={startQbt}>
              <Power size={14} />
              <Text ml={1}>Start</Text>
            </Button>
          )}
        </HStack>
      </HStack>

      {/* VPN status */}
      <Box
        p={3}
        borderRadius="lg"
        bg="var(--card-bg)"
        borderWidth="1px"
        borderColor={vpnUp ? 'green.500' : 'var(--border-color)'}
      >
        <HStack justify="space-between" flexWrap="wrap" gap={3}>
          <HStack gap={3} flex={1} flexWrap="wrap">
            <HStack>
              {vpnUp ? <Shield size={16} color="var(--green-text)" /> : <ShieldOff size={16} />}
              <Box w={2} h={2} borderRadius="full" bg={vpnUp ? 'green.400' : 'red.400'} />
              <Text fontSize="sm" fontWeight="medium">
                VPN {vpnUp ? 'Connected' : 'Disconnected'}
              </Text>
            </HStack>
            {vpnUp && vpn?.server && (
              <Badge colorPalette="green" fontSize="xs">{vpn.server}</Badge>
            )}
            {vpnUp && vpn?.country && (
              <Text fontSize="xs" color="var(--muted-text)">{vpn.country}{vpn.city ? ` — ${vpn.city}` : ''}</Text>
            )}
            {vpnUp && vpn?.ip && (
              <Badge variant="outline" fontSize="xs">{vpn.ip}</Badge>
            )}
            {vpnUp && vpn?.interface && (
              <Badge variant="outline" fontSize="xs" colorPalette="purple">{vpn.interface}</Badge>
            )}
            {vpn?.monitor_active && (
              <Badge colorPalette="blue" fontSize="xs">Monitor active</Badge>
            )}
          </HStack>
          <HStack gap={2}>
            {vpnUp && isConnected && (
              <Button size="xs" variant="outline" onClick={bindQbtToVpn} title="Bind qBittorrent to VPN interface">
                <Link size={12} />
                <Text ml={1}>Bind qBt</Text>
              </Button>
            )}
            {vpnUp ? (
              <Button size="xs" colorPalette="red" variant="outline" onClick={disconnectVpn}>
                <ShieldOff size={12} />
                <Text ml={1}>Disconnect</Text>
              </Button>
            ) : (
              <Button
                size="xs"
                colorPalette="green"
                variant="outline"
                onClick={connectVpn}
                disabled={vpnConnecting}
              >
                {vpnConnecting ? <Spinner size="xs" /> : <Shield size={12} />}
                <Text ml={1}>{vpnConnecting ? 'Connecting...' : 'Connect VPN'}</Text>
              </Button>
            )}
          </HStack>
        </HStack>
      </Box>

      {/* VPN killed qBittorrent warning */}
      {vpnKilledQbt && (
        <HStack
          p={3}
          borderRadius="lg"
          bg="var(--panel-red-bg)"
          borderWidth="1px"
          borderColor="var(--panel-red-border)"
          gap={3}
        >
          <ShieldAlert size={16} />
          <Text fontSize="sm" color="var(--panel-red-text)" flex={1}>
            {vpn?.last_event?.message}
          </Text>
          <Text fontSize="xs" color="var(--muted-text)">
            {vpn?.last_event?.timestamp ? new Date(vpn.last_event.timestamp).toLocaleTimeString() : ''}
          </Text>
        </HStack>
      )}

      {/* Status bar */}
      <HStack
        p={3}
        borderRadius="lg"
        bg="var(--card-bg)"
        borderWidth="1px"
        borderColor="var(--border-color)"
        gap={4}
        flexWrap="wrap"
      >
        <HStack>
          <Box w={2} h={2} borderRadius="full" bg={isConnected ? 'green.400' : isRunning ? 'orange.400' : 'red.400'} />
          <Text fontSize="sm" fontWeight="medium">
            {isConnected ? 'Connected' : isRunning ? 'Running (not connected)' : 'Offline'}
          </Text>
          {isRunning && !isConnected && status?.connection_error && (
            <Text fontSize="xs" color="var(--muted-text)">— {status.connection_error}</Text>
          )}
        </HStack>
        {transfer && (
          <>
            <HStack>
              <Download size={14} color="var(--icon-color)" />
              <Text fontSize="sm">{formatSpeed(transfer.dl_info_speed)}</Text>
            </HStack>
            <HStack>
              <Upload size={14} color="var(--icon-color)" />
              <Text fontSize="sm">{formatSpeed(transfer.up_info_speed)}</Text>
            </HStack>
          </>
        )}
        <HStack>
          <Badge colorPalette="blue">{torrents.length} torrents</Badge>
        </HStack>
      </HStack>

      {/* Error banner */}
      {error && (
        <Box p={3} borderRadius="lg" bg="var(--panel-red-bg)" borderWidth="1px" borderColor="var(--panel-red-border)" color="var(--panel-red-text)">
          <Text fontSize="sm">{error}</Text>
        </Box>
      )}

      {/* Config panel */}
      {showConfig && <ConfigPanel destinations={destinations} onSyncCategories={syncCategories} onSetupHook={setupHook} />}

      {/* Clipboard magnet detected */}
      {clipboardMagnet && isConnected && (
        <HStack
          p={3}
          borderRadius="lg"
          bg="var(--panel-blue-bg)"
          borderWidth="1px"
          borderColor="var(--panel-blue-border)"
          gap={3}
        >
          <Clipboard size={16} />
          <Text fontSize="sm" flex={1} truncate title={clipboardMagnet}>
            Magnet link detected in clipboard
          </Text>
          <HStack gap={1}>
            <Button size="xs" colorPalette="blue" onClick={useMagnetFromClipboard}>
              Use it
            </Button>
            <Button size="xs" variant="ghost" onClick={dismissClipboard}>
              <X size={12} />
            </Button>
          </HStack>
        </HStack>
      )}

      {/* Add torrent */}
      {isConnected && (
        <Box
          p={4}
          borderRadius="lg"
          bg="var(--card-bg)"
          borderWidth="1px"
          borderColor="var(--border-color)"
        >
          <HStack mb={2}>
            <Plus size={16} />
            <Text fontWeight="medium">Add Torrent</Text>
          </HStack>
          <Flex gap={3} flexWrap="wrap">
            <Textarea
              placeholder="Magnet link or torrent URL..."
              value={magnetUrl}
              onChange={e => setMagnetUrl(e.target.value)}
              flex={1}
              minW="300px"
              size="sm"
              rows={2}
              bg="var(--input-bg)"
            />
            <VStack gap={2} minW="150px">
              <Box as="select"
                value={selectedCategory}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedCategory(e.target.value)}
                w="100%"
                p={2}
                borderRadius="md"
                borderWidth="1px"
                borderColor="var(--border-color)"
                bg="var(--input-bg)"
                fontSize="sm"
              >
                {CATEGORIES.filter(c => destinations[c.value]).map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
                {CATEGORIES.filter(c => !destinations[c.value]).map(c => (
                  <option key={c.value} value={c.value} disabled>{c.label} (not configured)</option>
                ))}
              </Box>
              <Button
                size="sm"
                colorPalette="blue"
                onClick={addTorrent}
                disabled={adding || !magnetUrl.trim()}
                w="100%"
              >
                {adding ? <Spinner size="xs" /> : <Plus size={14} />}
                <Text ml={1}>Add</Text>
              </Button>
            </VStack>
          </Flex>
          {destinations[selectedCategory] && (
            <Text fontSize="xs" color="var(--muted-text)" mt={2}>
              → {destinations[selectedCategory]}
            </Text>
          )}
        </Box>
      )}

      {/* Torrent list */}
      {torrents.length > 0 && (
        <Box
          borderRadius="lg"
          bg="var(--card-bg)"
          borderWidth="1px"
          borderColor="var(--border-color)"
          overflow="hidden"
        >
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Name</Table.ColumnHeader>
                <Table.ColumnHeader>Size</Table.ColumnHeader>
                <Table.ColumnHeader>Progress</Table.ColumnHeader>
                <Table.ColumnHeader>Speed</Table.ColumnHeader>
                <Table.ColumnHeader>ETA</Table.ColumnHeader>
                <Table.ColumnHeader>Status</Table.ColumnHeader>
                <Table.ColumnHeader>Category</Table.ColumnHeader>
                <Table.ColumnHeader textAlign="right">Actions</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {torrents.map(t => {
                const st = stateLabel(t.state);
                const pct = Math.round(t.progress * 100);
                return (
                  <Table.Row key={t.hash}>
                    <Table.Cell maxW="300px">
                      <Text fontSize="sm" truncate title={t.name}>{t.name}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontSize="sm">{formatBytes(t.size)}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <HStack gap={2}>
                        <Box flex={1} h="6px" borderRadius="full" bg="var(--surface-muted)" overflow="hidden">
                          <Box h="100%" w={`${pct}%`} bg={pct >= 100 ? 'green.400' : 'blue.400'} borderRadius="full" transition="width 0.3s" />
                        </Box>
                        <Text fontSize="xs" minW="35px" textAlign="right">{pct}%</Text>
                      </HStack>
                    </Table.Cell>
                    <Table.Cell>
                      <VStack gap={0} align="start">
                        {t.dlspeed > 0 && <Text fontSize="xs">↓ {formatSpeed(t.dlspeed)}</Text>}
                        {t.upspeed > 0 && <Text fontSize="xs">↑ {formatSpeed(t.upspeed)}</Text>}
                      </VStack>
                    </Table.Cell>
                    <Table.Cell>
                      <Text fontSize="sm">{t.eta > 0 ? formatEta(t.eta) : '—'}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge colorPalette={st.color} fontSize="xs">{st.label}</Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge variant="outline" fontSize="xs">{t.category || '—'}</Badge>
                    </Table.Cell>
                    <Table.Cell textAlign="right">
                      <HStack gap={1} justify="end">
                        {t.state.includes('paused') || t.state.includes('stopped') ? (
                          <Button size="xs" variant="ghost" onClick={() => resumeTorrent(t.hash)} title="Resume">
                            <Play size={12} />
                          </Button>
                        ) : (
                          <Button size="xs" variant="ghost" onClick={() => pauseTorrent(t.hash)} title="Pause">
                            <Pause size={12} />
                          </Button>
                        )}
                        <Button size="xs" variant="ghost" colorPalette="red" onClick={() => removeTorrent(t.hash)} title="Remove">
                          <Trash2 size={12} />
                        </Button>
                      </HStack>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Root>
        </Box>
      )}

      {torrents.length === 0 && isConnected && (
        <Flex
          justify="center" py={8}
          borderRadius="lg" bg="var(--surface-muted)"
          borderWidth="1px" borderColor="var(--border-color)"
        >
          <VStack>
            <ArrowDownToLine size={32} color="var(--empty-text)" />
            <Text color="var(--empty-text)">No active torrents</Text>
          </VStack>
        </Flex>
      )}

      {!isConnected && (
        <Flex
          justify="center" py={8}
          borderRadius="lg" bg="var(--surface-muted)"
          borderWidth="1px" borderColor="var(--border-color)"
        >
          <VStack>
            <PowerOff size={32} color="var(--empty-text)" />
            <Text color="var(--empty-text)">
              qBittorrent is not running. Click Start to launch it.
            </Text>
          </VStack>
        </Flex>
      )}

      {/* Completed history */}
      {history.length > 0 && (
        <Box>
          <HStack mb={3}>
            <CheckCircle size={20} />
            <Heading size="md" color="var(--heading-color)">Completed</Heading>
            <Badge colorPalette="green">{history.length}</Badge>
          </HStack>
          <Box
            borderRadius="lg"
            bg="var(--card-bg)"
            borderWidth="1px"
            borderColor="var(--border-color)"
            overflow="hidden"
          >
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>Name</Table.ColumnHeader>
                  <Table.ColumnHeader>Type</Table.ColumnHeader>
                  <Table.ColumnHeader>Completed</Table.ColumnHeader>
                  <Table.ColumnHeader>Catalog</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {history.map(h => (
                  <Table.Row key={h.id}>
                    <Table.Cell maxW="400px">
                      <Text fontSize="sm" truncate title={h.name}>{h.name}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge variant="outline" fontSize="xs">{h.media_type || h.category}</Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <HStack gap={1}>
                        <Clock size={12} />
                        <Text fontSize="xs" color="var(--muted-text)">
                          {h.completed_at ? new Date(h.completed_at).toLocaleDateString() : '—'}
                        </Text>
                      </HStack>
                    </Table.Cell>
                    <Table.Cell>
                      {h.catalog_id ? (
                        <Badge colorPalette="green" fontSize="xs">Added #{h.catalog_id}</Badge>
                      ) : (
                        <Text fontSize="xs" color="var(--muted-text)">—</Text>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        </Box>
      )}
    </VStack>
  );
};

const ConfigPanel: React.FC<{
  destinations: Destinations;
  onSyncCategories: () => Promise<void>;
  onSetupHook: () => Promise<void>;
}> = ({ destinations, onSyncCategories, onSetupHook }) => {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    await onSyncCategories();
    setSyncing(false);
  };

  const handleHook = async () => {
    await onSetupHook();
  };

  return (
    <Box
      p={4}
      borderRadius="lg"
      bg="var(--card-bg)"
      borderWidth="1px"
      borderColor="var(--panel-blue-border)"
    >
      <HStack mb={3}>
        <Settings size={16} />
        <Text fontWeight="medium">Configuration</Text>
      </HStack>

      <VStack gap={3} align="stretch">
        <Box>
          <Text fontSize="sm" fontWeight="medium" mb={1}>Category → Library Folder Mapping</Text>
          {Object.keys(destinations).length > 0 ? (
            <VStack gap={1} align="stretch">
              {Object.entries(destinations).map(([cat, path]) => (
                <HStack key={cat} fontSize="sm" px={2} py={1} bg="var(--surface-muted)" borderRadius="md">
                  <Badge variant="outline" minW="60px" textAlign="center">{cat}</Badge>
                  <Text color="var(--muted-text)" fontSize="xs">→</Text>
                  <Text fontSize="xs" truncate flex={1} title={path}>{path}</Text>
                </HStack>
              ))}
            </VStack>
          ) : (
            <Text fontSize="sm" color="var(--muted-text)">
              No library folders configured. Set them up in the media library settings.
            </Text>
          )}
        </Box>

        <HStack gap={2}>
          <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            <Text ml={1}>Sync Categories to qBittorrent</Text>
          </Button>
          <Button size="sm" variant="outline" onClick={handleHook}>
            <Settings size={14} />
            <Text ml={1}>Setup Completion Hook</Text>
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
};

export default TorrentsPage;
