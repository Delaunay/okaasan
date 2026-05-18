import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Text, Heading, Input, Button, Badge, Spinner } from '@chakra-ui/react';
import { Headphones, ArrowLeft, FolderOpen, Trash2, RefreshCw } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface AudiobooksStatus {
  configured: boolean;
  folders: string[];
  total_books: number;
  in_progress: number;
  completed: number;
  last_scan: string | null;
}

const AudiobooksSettings: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<AudiobooksStatus | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [newFolder, setNewFolder] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    recipeAPI.request<AudiobooksStatus>('/audiobooks/status')
      .then(data => {
        setStatus(data);
        setFolders(data.folders);
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await recipeAPI.request('/audiobooks/configure', {
        method: 'POST',
        body: JSON.stringify({ folders }),
      });
      const updated = await recipeAPI.request<AudiobooksStatus>('/audiobooks/status');
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
      await recipeAPI.request('/audiobooks/scan', { method: 'POST' });
      const updated = await recipeAPI.request<AudiobooksStatus>('/audiobooks/status');
      setStatus(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  };

  const addFolder = () => {
    const path = newFolder.trim();
    if (!path) return;
    setFolders(prev => [...prev, path]);
    setNewFolder('');
  };

  const removeFolder = (idx: number) => {
    setFolders(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <Box maxW="3xl" mx="auto" p={6}>
      <VStack align="stretch" gap={6}>
        <HStack>
          <Button size="sm" variant="ghost" onClick={() => navigate('/settings')}>
            <ArrowLeft size={16} />
          </Button>
          <Headphones size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Audiobooks Library</Heading>
        </HStack>

        {status && (
          <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
            <HStack gap={4} flexWrap="wrap">
              <Box>
                <Text fontSize="xs" color="var(--muted-text)">Total Books</Text>
                <Text fontSize="lg" fontWeight="bold">{status.total_books}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="var(--muted-text)">In Progress</Text>
                <Text fontSize="lg" fontWeight="bold" color="blue">{status.in_progress}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="var(--muted-text)">Completed</Text>
                <Text fontSize="lg" fontWeight="bold" color="green">{status.completed}</Text>
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

        <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <HStack mb={3}>
            <Headphones size={16} />
            <Text fontWeight="semibold">Audiobook Folders</Text>
            <Badge colorPalette="gray" fontSize="xs">{folders.length} folders</Badge>
          </HStack>
          <VStack align="stretch" gap={2}>
            {folders.map((path, idx) => (
              <HStack key={idx} p={2} bg="var(--surface-muted)" borderRadius="md">
                <FolderOpen size={14} color="var(--muted-text)" />
                <Text fontSize="sm" flex={1} fontFamily="mono">{path}</Text>
                <Button size="xs" variant="ghost" colorPalette="red" onClick={() => removeFolder(idx)}>
                  <Trash2 size={12} />
                </Button>
              </HStack>
            ))}
            <HStack>
              <Input
                size="sm"
                placeholder="Add audiobooks folder path..."
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addFolder()}
                fontFamily="mono"
              />
              <Button size="sm" onClick={addFolder} disabled={!newFolder.trim()}>
                Add
              </Button>
            </HStack>
          </VStack>
        </Box>

        <Button onClick={handleSave} disabled={saving} colorPalette="blue">
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </VStack>
    </Box>
  );
};

export default AudiobooksSettings;
