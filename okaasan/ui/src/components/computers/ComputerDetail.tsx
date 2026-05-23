import { FC, useEffect, useState, useCallback, useRef } from 'react';
import {
  Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Input, Button,
} from '@chakra-ui/react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Server, Cpu, HardDrive, Clock, Network, Thermometer,
  ArrowLeft, Play, X, FolderOpen, CheckCircle, AlertCircle, FileVideo,
} from 'lucide-react';
import { recipeAPI } from '../../services/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  if (bytes < 1024 ** 4) return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
  return `${(bytes / (1024 ** 4)).toFixed(2)} TB`;
}

function formatUptime(sec: number): string {
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  return `${hours}h ${mins}m`;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec.toFixed(0)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const UsageBar: FC<{ pct: number; h?: string }> = ({ pct, h = '8px' }) => {
  const color = pct > 90 ? 'red.500' : pct > 70 ? 'orange.400' : 'green.400';
  return (
    <Box w="100%" h={h} borderRadius="full" bg="var(--surface-muted)" overflow="hidden">
      <Box h="100%" w={`${Math.min(pct, 100)}%`} bg={color} borderRadius="full" transition="width 0.3s" />
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface Partition {
  device: string;
  mountpoint: string;
  fstype: string;
  total: number;
  used: number;
  pct: number;
}

interface NetInterface {
  name: string;
  ip: string | null;
  is_up: boolean;
  speed_mbps: number;
}

interface ComputerInfo {
  id: string;
  name: string;
  hostname: string;
  os: string;
  arch: string;
  cpu_count: number;
  cpu_pct: number;
  ram_total: number;
  ram_used: number;
  ram_pct: number;
  disk_total: number;
  disk_used: number;
  disk_pct: number;
  uptime_sec: number;
  status: string;
  partitions: Partition[];
  networks: NetInterface[];
  temps: Record<string, { label: string; current: number }[]> | null;
}

interface ManifestEntry {
  path: string;
  size_before: number;
  size_after: number | null;
  status: string;
  saved: number | null;
  duration_sec: number | null;
  new_path?: string;
  error?: string;
}

interface TaskInfo {
  id: number;
  computer_id: string;
  task_type: string;
  status: string;
  config: { folder: string; recursive?: boolean; preset?: number; crf?: number; threads?: number; max_files?: number } | null;
  manifest: ManifestEntry[] | null;
  current_file: string | null;
  files_total: number;
  files_done: number;
  progress_pct: number;
  bytes_saved: number;
  error: string | null;
  logs: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ComputerDetail: FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<ComputerInfo | null>(null);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // New task form
  const [showForm, setShowForm] = useState(false);
  const [folder, setFolder] = useState('');
  const [preset, setPreset] = useState(4);
  const [crf, setCrf] = useState(28);
  const [threads, setThreads] = useState<number | null>(4);
  const [maxFiles, setMaxFiles] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const computerId = id || 'local';

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [infoData, taskData] = await Promise.all([
        recipeAPI.getComputer(computerId),
        recipeAPI.getComputerTasks(computerId),
      ]);
      setInfo(infoData);
      setTasks(taskData);
    } catch (err) {
      console.error('Failed to fetch computer data:', err);
    } finally {
      setLoading(false);
    }
  }, [computerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll while any task is active
  useEffect(() => {
    const hasActive = tasks.some((t) => t.status === 'running' || t.status === 'pending');
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(() => fetchData(true), 3000);
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [tasks, fetchData]);

  const handleStartTask = async () => {
    if (!folder.trim()) {
      setFormError('Folder path is required');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await recipeAPI.startAv1Task(computerId, {
        folder: folder.trim(), preset, crf,
        threads: threads ?? undefined,
        max_files: maxFiles ?? undefined,
      });
      setShowForm(false);
      setFolder('');
      fetchData(true);
    } catch (err: any) {
      const msg = err?.message || 'Failed to start task';
      setFormError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (taskId: number) => {
    try {
      await recipeAPI.cancelComputerTask(computerId, taskId);
      fetchData(true);
    } catch (err) {
      console.error('Failed to cancel task:', err);
    }
  };

  if (loading) {
    return <Flex justify="center" align="center" minH="200px"><Spinner size="lg" /></Flex>;
  }

  if (!info) {
    return (
      <VStack gap={4} p={4}>
        <Text color="var(--muted-text)">Computer not found.</Text>
        <Button size="sm" variant="outline" onClick={() => navigate('/computers')}>Back</Button>
      </VStack>
    );
  }

  const activeTasks = tasks.filter((t) => t.status === 'running' || t.status === 'pending');
  const completedTasks = tasks.filter((t) => !['running', 'pending'].includes(t.status));

  return (
    <VStack gap={6} align="stretch" p={4}>
      {/* Header */}
      <HStack>
        <Box cursor="pointer" onClick={() => navigate('/computers')} p={1} borderRadius="md" _hover={{ bg: 'var(--hover-bg)' }}>
          <ArrowLeft size={20} color="var(--icon-color)" />
        </Box>
        <Server size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)">{info.hostname}</Heading>
        <Badge colorPalette="green" variant="subtle">{info.status}</Badge>
      </HStack>

      {/* System Info */}
      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
        {/* Overview card */}
        <Box p={4} borderRadius="lg" border="1px solid" borderColor="var(--border-color)" bg="var(--card-bg)">
          <HStack mb={3}>
            <Cpu size={18} color="var(--icon-color)" />
            <Text fontWeight="bold">System</Text>
          </HStack>
          <VStack gap={3} align="stretch">
            <HStack justify="space-between">
              <Text fontSize="sm" color="var(--muted-text)">OS</Text>
              <Text fontSize="sm">{info.os}</Text>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="sm" color="var(--muted-text)">Architecture</Text>
              <Text fontSize="sm">{info.arch}</Text>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="sm" color="var(--muted-text)">CPU Cores</Text>
              <Text fontSize="sm">{info.cpu_count}</Text>
            </HStack>
            <Box>
              <HStack justify="space-between" mb={1}>
                <Text fontSize="sm" color="var(--muted-text)">CPU Usage</Text>
                <Text fontSize="sm" fontWeight="semibold">{info.cpu_pct}%</Text>
              </HStack>
              <UsageBar pct={info.cpu_pct} />
            </Box>
            <Box>
              <HStack justify="space-between" mb={1}>
                <Text fontSize="sm" color="var(--muted-text)">RAM</Text>
                <Text fontSize="sm" fontWeight="semibold">{formatBytes(info.ram_used)} / {formatBytes(info.ram_total)}</Text>
              </HStack>
              <UsageBar pct={info.ram_pct} />
            </Box>
            <HStack justify="space-between">
              <Text fontSize="sm" color="var(--muted-text)">Uptime</Text>
              <HStack gap={1}>
                <Clock size={14} color="var(--muted-text)" />
                <Text fontSize="sm">{formatUptime(info.uptime_sec)}</Text>
              </HStack>
            </HStack>
          </VStack>
        </Box>

        {/* Storage card */}
        <Box p={4} borderRadius="lg" border="1px solid" borderColor="var(--border-color)" bg="var(--card-bg)">
          <HStack mb={3}>
            <HardDrive size={18} color="var(--icon-color)" />
            <Text fontWeight="bold">Storage</Text>
          </HStack>
          <VStack gap={3} align="stretch">
            {info.partitions.map((p) => (
              <Box key={p.mountpoint}>
                <HStack justify="space-between" mb={1}>
                  <Text fontSize="xs" color="var(--muted-text)" title={p.device}>{p.mountpoint}</Text>
                  <Text fontSize="xs" fontWeight="semibold">{formatBytes(p.used)} / {formatBytes(p.total)}</Text>
                </HStack>
                <UsageBar pct={p.pct} h="6px" />
              </Box>
            ))}
          </VStack>
        </Box>

        {/* Network card */}
        <Box p={4} borderRadius="lg" border="1px solid" borderColor="var(--border-color)" bg="var(--card-bg)">
          <HStack mb={3}>
            <Network size={18} color="var(--icon-color)" />
            <Text fontWeight="bold">Network</Text>
          </HStack>
          <VStack gap={2} align="stretch">
            {info.networks.map((n) => (
              <HStack key={n.name} justify="space-between">
                <HStack gap={2}>
                  <Badge colorPalette={n.is_up ? 'green' : 'gray'} variant="subtle" fontSize="2xs">
                    {n.is_up ? 'UP' : 'DOWN'}
                  </Badge>
                  <Text fontSize="sm">{n.name}</Text>
                </HStack>
                <Text fontSize="sm" color="var(--muted-text)">
                  {n.ip || '—'}{n.speed_mbps ? ` (${n.speed_mbps} Mbps)` : ''}
                </Text>
              </HStack>
            ))}
            {info.networks.length === 0 && (
              <Text fontSize="sm" color="var(--muted-text)">No interfaces detected</Text>
            )}
          </VStack>
        </Box>

        {/* Temps card (if available) */}
        {info.temps && Object.keys(info.temps).length > 0 && (
          <Box p={4} borderRadius="lg" border="1px solid" borderColor="var(--border-color)" bg="var(--card-bg)">
            <HStack mb={3}>
              <Thermometer size={18} color="var(--icon-color)" />
              <Text fontWeight="bold">Temperatures</Text>
            </HStack>
            <VStack gap={2} align="stretch">
              {Object.entries(info.temps).map(([zone, sensors]) =>
                sensors.map((s, i) => (
                  <HStack key={`${zone}-${i}`} justify="space-between">
                    <Text fontSize="sm" color="var(--muted-text)">{s.label || zone}</Text>
                    <Text fontSize="sm" fontWeight="semibold">{s.current}°C</Text>
                  </HStack>
                ))
              )}
            </VStack>
          </Box>
        )}
      </Grid>

      {/* Tasks Section */}
      <Box>
        <HStack justify="space-between" mb={4}>
          <HStack>
            <FileVideo size={20} color="var(--icon-color)" />
            <Heading size="md" color="var(--heading-color)">Tasks</Heading>
          </HStack>
          <Button
            size="sm"
            colorPalette="orange"
            onClick={() => setShowForm(!showForm)}
            disabled={activeTasks.length > 0}
          >
            <Play size={14} />
            New AV1 Conversion
          </Button>
        </HStack>

        {/* New task form */}
        {showForm && (
          <Box p={4} mb={4} borderRadius="lg" border="1px solid" borderColor="var(--panel-border)" bg="var(--card-bg)">
            <VStack gap={3} align="stretch">
              <Text fontWeight="bold" fontSize="sm">AV1 Video Conversion</Text>
              <Box>
                <Text fontSize="xs" color="var(--muted-text)" mb={1}>Folder Path</Text>
                <HStack>
                  <FolderOpen size={16} color="var(--muted-text)" />
                  <Input
                    size="sm"
                    placeholder="/path/to/videos"
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                    bg="var(--input-bg)"
                    borderColor="var(--border-color)"
                  />
                </HStack>
              </Box>
              <Grid templateColumns="1fr 1fr" gap={3}>
                <Box>
                  <Text fontSize="xs" color="var(--muted-text)" mb={1}>Preset (0-13, lower = slower)</Text>
                  <Input
                    size="sm"
                    type="number"
                    min={0} max={13}
                    value={preset}
                    onChange={(e) => setPreset(Number(e.target.value))}
                    bg="var(--input-bg)"
                    borderColor="var(--border-color)"
                  />
                </Box>
                <Box>
                  <Text fontSize="xs" color="var(--muted-text)" mb={1}>CRF (18-50, lower = better quality)</Text>
                  <Input
                    size="sm"
                    type="number"
                    min={18} max={50}
                    value={crf}
                    onChange={(e) => setCrf(Number(e.target.value))}
                    bg="var(--input-bg)"
                    borderColor="var(--border-color)"
                  />
                </Box>
              </Grid>
              <Grid templateColumns="1fr 1fr" gap={3}>
                <Box>
                  <Text fontSize="xs" color="var(--muted-text)" mb={1}>CPU Threads (empty = all cores)</Text>
                  <Input
                    size="sm"
                    type="number"
                    min={1} max={info?.cpu_count || 32}
                    placeholder="e.g. 4"
                    value={threads ?? ''}
                    onChange={(e) => setThreads(e.target.value ? Number(e.target.value) : null)}
                    bg="var(--input-bg)"
                    borderColor="var(--border-color)"
                  />
                </Box>
                <Box>
                  <Text fontSize="xs" color="var(--muted-text)" mb={1}>Max Files (empty = all)</Text>
                  <Input
                    size="sm"
                    type="number"
                    min={1}
                    placeholder="e.g. 1"
                    value={maxFiles ?? ''}
                    onChange={(e) => setMaxFiles(e.target.value ? Number(e.target.value) : null)}
                    bg="var(--input-bg)"
                    borderColor="var(--border-color)"
                  />
                </Box>
              </Grid>
              {formError && (
                <Text fontSize="xs" color="red.500">{formError}</Text>
              )}
              <HStack justify="flex-end" gap={2}>
                <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button size="sm" colorPalette="orange" onClick={handleStartTask} disabled={submitting}>
                  {submitting ? 'Starting...' : 'Start Conversion'}
                </Button>
              </HStack>
            </VStack>
          </Box>
        )}

        {/* Active tasks */}
        {activeTasks.map((task) => (
          <ActiveTaskCard key={task.id} task={task} onCancel={() => handleCancel(task.id)} />
        ))}

        {/* Completed tasks */}
        {completedTasks.length > 0 && (
          <Box mt={4}>
            <Text fontSize="sm" fontWeight="semibold" color="var(--muted-text)" mb={2}>History</Text>
            <VStack gap={2} align="stretch">
              {completedTasks.map((task) => (
                <CompletedTaskCard key={task.id} task={task} />
              ))}
            </VStack>
          </Box>
        )}

        {activeTasks.length === 0 && completedTasks.length === 0 && !showForm && (
          <Flex justify="center" py={8}>
            <Text fontSize="sm" color="var(--muted-text)">No tasks yet. Start an AV1 conversion to begin.</Text>
          </Flex>
        )}
      </Box>
    </VStack>
  );
};

// ---------------------------------------------------------------------------
// Task sub-components
// ---------------------------------------------------------------------------

const ActiveTaskCard: FC<{ task: TaskInfo; onCancel: () => void }> = ({ task, onCancel }) => {
  const manifest = task.manifest || [];
  const doneCount = manifest.filter((e) => e.status === 'done').length;
  const failedCount = manifest.filter((e) => e.status === 'failed').length;

  return (
    <Box p={4} mb={2} borderRadius="lg" border="1px solid" borderColor="orange.400" bg="var(--card-bg)">
      <HStack justify="space-between" mb={3}>
        <HStack gap={2}>
          <Badge colorPalette="orange" variant="subtle">{task.status}</Badge>
          <Text fontSize="sm" fontWeight="bold">{task.config?.folder}</Text>
        </HStack>
        <Button size="xs" variant="outline" colorPalette="red" onClick={onCancel}>
          <X size={12} /> Cancel
        </Button>
      </HStack>

      {/* Progress bar */}
      <Box mb={2}>
        <HStack justify="space-between" mb={1}>
          <Text fontSize="xs" color="var(--muted-text)">
            {task.files_done} / {task.files_total} files
            {failedCount > 0 && ` (${failedCount} failed)`}
          </Text>
          <Text fontSize="xs" fontWeight="semibold">{task.progress_pct}%</Text>
        </HStack>
        <Box w="100%" h="8px" borderRadius="full" bg="var(--surface-muted)" overflow="hidden">
          <Box h="100%" w={`${task.progress_pct}%`} bg="orange.400" borderRadius="full" transition="width 0.5s" />
        </Box>
      </Box>

      {/* Current file */}
      {task.current_file && (
        <HStack gap={2} mb={2}>
          <FileVideo size={14} color="var(--muted-text)" />
          <Text fontSize="xs" color="var(--muted-text)" lineClamp={1}>Converting: {task.current_file}</Text>
        </HStack>
      )}

      {/* Stats */}
      <HStack gap={4}>
        <HStack gap={1}>
          <CheckCircle size={12} color="var(--muted-text)" />
          <Text fontSize="xs" color="var(--muted-text)">{doneCount} converted</Text>
        </HStack>
        <HStack gap={1}>
          <HardDrive size={12} color="var(--muted-text)" />
          <Text fontSize="xs" color="var(--muted-text)">Saved: {formatBytes(task.bytes_saved)}</Text>
        </HStack>
        {task.started_at && (
          <Text fontSize="xs" color="var(--muted-text)">Started {timeAgo(task.started_at)}</Text>
        )}
      </HStack>

      {/* Logs */}
      <TaskLogs logs={task.logs} error={task.error} />
    </Box>
  );
};

const CompletedTaskCard: FC<{ task: TaskInfo }> = ({ task }) => {
  const [expanded, setExpanded] = useState(false);
  const manifest = task.manifest || [];
  const doneCount = manifest.filter((e) => e.status === 'done').length;
  const failedCount = manifest.filter((e) => e.status === 'failed').length;
  const skippedCount = manifest.filter((e) => e.status === 'skipped').length;
  const statusColor = task.status === 'completed' ? 'green' : task.status === 'cancelled' ? 'yellow' : 'red';

  let duration = '';
  if (task.started_at && task.completed_at) {
    const sec = (new Date(task.completed_at).getTime() - new Date(task.started_at).getTime()) / 1000;
    duration = formatDuration(sec);
  }

  return (
    <Box
      p={3}
      borderRadius="lg"
      border="1px solid"
      borderColor="var(--border-color)"
      bg="var(--card-bg)"
      cursor="pointer"
      onClick={() => setExpanded(!expanded)}
      _hover={{ borderColor: 'orange.300' }}
    >
      <HStack justify="space-between">
        <HStack gap={2}>
          <Badge colorPalette={statusColor} variant="subtle" fontSize="2xs">{task.status}</Badge>
          <Text fontSize="sm" lineClamp={1}>{task.config?.folder}</Text>
        </HStack>
        <HStack gap={3}>
          {doneCount > 0 && <Text fontSize="xs" color="green.500">{doneCount} done</Text>}
          {failedCount > 0 && <Text fontSize="xs" color="red.500">{failedCount} failed</Text>}
          {skippedCount > 0 && <Text fontSize="xs" color="var(--muted-text)">{skippedCount} skipped</Text>}
          {task.bytes_saved > 0 && (
            <Text fontSize="xs" fontWeight="semibold" color="green.500">-{formatBytes(task.bytes_saved)}</Text>
          )}
          {duration && <Text fontSize="xs" color="var(--muted-text)">{duration}</Text>}
        </HStack>
      </HStack>

      {expanded && manifest.length > 0 && (
        <VStack gap={1} align="stretch" mt={3} pt={3} borderTop="1px solid" borderColor="var(--border-color)">
          {manifest.map((entry, i) => {
            const name = entry.path.split('/').pop() || entry.path;
            const icon = entry.status === 'done' ? <CheckCircle size={12} color="green" /> :
                         entry.status === 'failed' ? <AlertCircle size={12} color="red" /> :
                         <FileVideo size={12} color="var(--muted-text)" />;
            return (
              <HStack key={i} justify="space-between" fontSize="xs">
                <HStack gap={2} minW={0} flex={1}>
                  {icon}
                  <Text lineClamp={1} title={entry.path}>{name}</Text>
                </HStack>
                <HStack gap={2} flexShrink={0}>
                  <Text color="var(--muted-text)">{formatBytes(entry.size_before)}</Text>
                  {entry.size_after != null && (
                    <>
                      <Text color="var(--muted-text)">→</Text>
                      <Text>{formatBytes(entry.size_after)}</Text>
                    </>
                  )}
                  {entry.saved != null && entry.saved > 0 && (
                    <Text color="green.500" fontWeight="semibold">-{formatBytes(entry.saved)}</Text>
                  )}
                  {entry.duration_sec != null && (
                    <Text color="var(--muted-text)">{formatDuration(entry.duration_sec)}</Text>
                  )}
                </HStack>
              </HStack>
            );
          })}
        </VStack>
      )}

      {expanded && <TaskLogs logs={task.logs} error={task.error} />}
    </Box>
  );
};

const TaskLogs: FC<{ logs: string | null; error: string | null }> = ({ logs, error }) => {
  const logRef = useRef<HTMLDivElement>(null);
  const lines = logs ? logs.split('\n').filter(Boolean) : [];

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  if (!logs && !error) return null;

  return (
    <Box mt={3} pt={3} borderTop="1px solid" borderColor="var(--border-color)">
      {error && (
        <Box mb={2} p={2} borderRadius="md" bg="var(--surface-muted)" border="1px solid" borderColor="red.300">
          <Text fontSize="xs" color="red.500" fontWeight="semibold">Error: {error}</Text>
        </Box>
      )}
      {lines.length > 0 && (
        <Box
          ref={logRef}
          maxH="200px"
          overflowY="auto"
          p={2}
          borderRadius="md"
          bg="var(--surface-muted)"
          fontFamily="mono"
          fontSize="11px"
          lineHeight="1.5"
        >
          {lines.map((line, i) => (
            <Text
              key={i}
              color={line.includes('FAILED') || line.includes('ERROR') || line.includes('CRASH') ? 'red.400' :
                     line.includes('OK:') ? 'green.400' :
                     line.includes('SKIP') ? 'yellow.500' : 'var(--muted-text)'}
              whiteSpace="pre-wrap"
              wordBreak="break-all"
            >
              {line}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default ComputerDetail;
