import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Text, Heading, Input, Button, Badge, Spinner } from '@chakra-ui/react';
import { HardDrive, ArrowLeft, FolderOpen, Trash2, RefreshCw, Film, Tv, Sparkles } from 'lucide-react';
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

  useEffect(() => {
    recipeAPI.request<LibraryStatus>('/shows/library/status')
      .then(data => {
        setStatus(data);
        setFolders(data.folders);
      })
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

        <Button onClick={handleSave} disabled={saving} colorPalette="blue">
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </VStack>
    </Box>
  );
};

export default LibrarySettings;
