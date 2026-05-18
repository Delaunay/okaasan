import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Text, Heading, Input, Button, Badge, Spinner } from '@chakra-ui/react';
import { HardDrive, ArrowLeft, FolderOpen, Trash2, RefreshCw, Film, Tv, Sparkles, Clock } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface LibraryStatus {
  configured: boolean;
  folders: { shows: string[]; movies: string[]; anime: string[] };
  total_files: number;
  matched_files: number;
  unmatched_files: number;
  last_scan: string | null;
  scan_interval_minutes: number;
}

interface ScanSchedule {
  scan_mode: 'daily' | 'interval';
  scan_hour: number;
  scan_timezone: string;
  scan_interval_minutes: number;
}

const LibrarySettings: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [folders, setFolders] = useState<{ shows: string[]; movies: string[]; anime: string[] }>({
    shows: [], movies: [], anime: [],
  });
  const [newFolder, setNewFolder] = useState<{ shows: string; movies: string; anime: string }>({
    shows: '', movies: '', anime: '',
  });
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [schedule, setSchedule] = useState<ScanSchedule>({
    scan_mode: 'daily', scan_hour: 1, scan_timezone: 'UTC', scan_interval_minutes: 1440,
  });
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    recipeAPI.request<LibraryStatus>('/shows/library/status')
      .then(data => {
        setStatus(data);
        setFolders(data.folders);
      })
      .catch(console.error);
    recipeAPI.request<ScanSchedule>('/scan/schedule')
      .then(setSchedule)
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await recipeAPI.request('/shows/library/configure', {
        method: 'POST',
        body: JSON.stringify({ folders }),
      });
      const updated = await recipeAPI.request<LibraryStatus>('/shows/library/status');
      setStatus(updated);
      window.dispatchEvent(new Event('sidebar-config-changed'));
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      await recipeAPI.request('/shows/library/scan', { method: 'POST' });
      const updated = await recipeAPI.request<LibraryStatus>('/shows/library/status');
      setStatus(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    try {
      const result = await recipeAPI.request<ScanSchedule>('/scan/schedule', {
        method: 'POST',
        body: JSON.stringify(schedule),
      });
      setSchedule(result);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingSchedule(false);
    }
  };

  const addFolder = (type: 'shows' | 'movies' | 'anime') => {
    const path = newFolder[type].trim();
    if (!path) return;
    setFolders(prev => ({ ...prev, [type]: [...prev[type], path] }));
    setNewFolder(prev => ({ ...prev, [type]: '' }));
  };

  const removeFolder = (type: 'shows' | 'movies' | 'anime', idx: number) => {
    setFolders(prev => ({ ...prev, [type]: prev[type].filter((_, i) => i !== idx) }));
  };

  const typeConfig: { key: 'shows' | 'movies' | 'anime'; label: string; icon: React.ReactNode }[] = [
    { key: 'shows', label: 'TV Shows', icon: <Tv size={16} /> },
    { key: 'movies', label: 'Movies', icon: <Film size={16} /> },
    { key: 'anime', label: 'Anime', icon: <Sparkles size={16} /> },
  ];

  return (
    <Box maxW="3xl" mx="auto" p={6}>
      <VStack align="stretch" gap={6}>
        <HStack>
          <Button size="sm" variant="ghost" onClick={() => navigate('/settings')}>
            <ArrowLeft size={16} />
          </Button>
          <HardDrive size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Media Library</Heading>
        </HStack>

        {/* Status */}
        {status && (
          <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
            <HStack gap={4} flexWrap="wrap">
              <Box>
                <Text fontSize="xs" color="var(--muted-text)">Total Files</Text>
                <Text fontSize="lg" fontWeight="bold">{status.total_files}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="var(--muted-text)">Matched</Text>
                <Text fontSize="lg" fontWeight="bold" color="green">{status.matched_files}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="var(--muted-text)">Unmatched</Text>
                <Text fontSize="lg" fontWeight="bold" color="orange">{status.unmatched_files}</Text>
              </Box>
              {status.last_scan && (
                <Box>
                  <Text fontSize="xs" color="var(--muted-text)">Last Scan</Text>
                  <Text fontSize="sm">{new Date(status.last_scan).toLocaleString()}</Text>
                </Box>
              )}
            </HStack>
            <Button
              size="sm"
              mt={3}
              onClick={handleScan}
              disabled={scanning}
            >
              {scanning ? <Spinner size="xs" /> : <RefreshCw size={14} />}
              <Text ml={1}>{scanning ? 'Scanning...' : 'Scan Now'}</Text>
            </Button>
          </Box>
        )}

        {/* Folder configuration */}
        {typeConfig.map(({ key, label, icon }) => (
          <Box key={key} p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
            <HStack mb={3}>
              {icon}
              <Text fontWeight="semibold">{label}</Text>
              <Badge colorPalette="gray" fontSize="xs">{folders[key].length} folders</Badge>
            </HStack>
            <VStack align="stretch" gap={2}>
              {folders[key].map((path, idx) => (
                <HStack key={idx} p={2} bg="var(--surface-muted)" borderRadius="md">
                  <FolderOpen size={14} color="var(--muted-text)" />
                  <Text fontSize="sm" flex={1} fontFamily="mono">{path}</Text>
                  <Button size="xs" variant="ghost" colorPalette="red" onClick={() => removeFolder(key, idx)}>
                    <Trash2 size={12} />
                  </Button>
                </HStack>
              ))}
              <HStack>
                <Input
                  size="sm"
                  placeholder={`Add ${label.toLowerCase()} folder path...`}
                  value={newFolder[key]}
                  onChange={(e) => setNewFolder(prev => ({ ...prev, [key]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addFolder(key)}
                  fontFamily="mono"
                />
                <Button size="sm" onClick={() => addFolder(key)} disabled={!newFolder[key].trim()}>
                  Add
                </Button>
              </HStack>
            </VStack>
          </Box>
        ))}

        {/* Scan Schedule */}
        <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <HStack mb={3}>
            <Clock size={16} color="var(--icon-color)" />
            <Text fontWeight="semibold">Scan Schedule</Text>
            <Badge colorPalette="blue" fontSize="xs">All Libraries</Badge>
          </HStack>
          <Text fontSize="xs" color="var(--muted-text)" mb={3}>
            Controls when all media libraries are re-scanned. Scans are skipped if no files changed.
          </Text>
          <VStack align="stretch" gap={3}>
            <HStack>
              <Text fontSize="sm" minW="80px">Mode:</Text>
              <HStack gap={2}>
                <Button
                  size="xs"
                  variant={schedule.scan_mode === 'daily' ? 'solid' : 'outline'}
                  colorPalette={schedule.scan_mode === 'daily' ? 'blue' : 'gray'}
                  onClick={() => setSchedule(s => ({ ...s, scan_mode: 'daily' }))}
                >
                  Daily
                </Button>
                <Button
                  size="xs"
                  variant={schedule.scan_mode === 'interval' ? 'solid' : 'outline'}
                  colorPalette={schedule.scan_mode === 'interval' ? 'blue' : 'gray'}
                  onClick={() => setSchedule(s => ({ ...s, scan_mode: 'interval' }))}
                >
                  Interval
                </Button>
              </HStack>
            </HStack>
            {schedule.scan_mode === 'daily' ? (
              <HStack>
                <Text fontSize="sm" minW="80px">Scan at:</Text>
                <Input
                  size="sm"
                  type="number"
                  min={0}
                  max={23}
                  w="70px"
                  value={schedule.scan_hour}
                  onChange={(e) => setSchedule(s => ({ ...s, scan_hour: parseInt(e.target.value) || 0 }))}
                />
                <Text fontSize="sm">:00</Text>
                <Input
                  size="sm"
                  w="140px"
                  placeholder="UTC"
                  value={schedule.scan_timezone}
                  onChange={(e) => setSchedule(s => ({ ...s, scan_timezone: e.target.value }))}
                />
              </HStack>
            ) : (
              <HStack>
                <Text fontSize="sm" minW="80px">Every:</Text>
                <Input
                  size="sm"
                  type="number"
                  min={15}
                  w="80px"
                  value={schedule.scan_interval_minutes}
                  onChange={(e) => setSchedule(s => ({ ...s, scan_interval_minutes: parseInt(e.target.value) || 60 }))}
                />
                <Text fontSize="sm">minutes</Text>
              </HStack>
            )}
            <Button
              size="sm"
              colorPalette="blue"
              variant="outline"
              onClick={handleSaveSchedule}
              disabled={savingSchedule}
              alignSelf="flex-start"
            >
              {savingSchedule ? 'Saving...' : 'Save Schedule'}
            </Button>
          </VStack>
        </Box>

        <Button onClick={handleSave} disabled={saving} colorPalette="blue">
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </VStack>
    </Box>
  );
};

export default LibrarySettings;
