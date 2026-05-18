import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Text, Heading, Input, Button, Badge, Spinner } from '@chakra-ui/react';
import { Layers, ArrowLeft, FolderOpen, Trash2, RefreshCw, Key } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface ComicsStatus {
  configured: boolean;
  folders: string[];
  comicvine_api_key: string | null;
  total_series: number;
  total_issues: number;
  last_scan: string | null;
}

const ComicsSettings: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ComicsStatus | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [newFolder, setNewFolder] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    recipeAPI.request<ComicsStatus>('/comics/status')
      .then(data => {
        setStatus(data);
        setFolders(data.folders);
        setApiKey(data.comicvine_api_key || '');
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await recipeAPI.request('/comics/configure', {
        method: 'POST',
        body: JSON.stringify({ folders, comicvine_api_key: apiKey || null }),
      });
      const updated = await recipeAPI.request<ComicsStatus>('/comics/status');
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
      await recipeAPI.request('/comics/scan', { method: 'POST' });
      const updated = await recipeAPI.request<ComicsStatus>('/comics/status');
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
          <Layers size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Comics &amp; Manga</Heading>
        </HStack>

        {status && (
          <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
            <HStack gap={4} flexWrap="wrap">
              <Box>
                <Text fontSize="xs" color="var(--muted-text)">Series</Text>
                <Text fontSize="lg" fontWeight="bold">{status.total_series}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="var(--muted-text)">Issues</Text>
                <Text fontSize="lg" fontWeight="bold">{status.total_issues}</Text>
              </Box>
              {status.last_scan && (
                <Box>
                  <Text fontSize="xs" color="var(--muted-text)">Last Scan</Text>
                  <Text fontSize="sm">{new Date(status.last_scan).toLocaleString()}</Text>
                </Box>
              )}
            </HStack>
            <Button size="sm" mt={3} onClick={handleScan} disabled={scanning}>
              {scanning ? <Spinner size="xs" /> : <RefreshCw size={14} />}
              <Text ml={1}>{scanning ? 'Scanning...' : 'Scan Now'}</Text>
            </Button>
          </Box>
        )}

        {/* ComicVine API Key */}
        <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <HStack mb={3}>
            <Key size={16} />
            <Text fontWeight="semibold">ComicVine API Key</Text>
          </HStack>
          <Text fontSize="sm" color="var(--muted-text)" mb={3}>
            Optional. Used to fetch metadata like descriptions, authors, and covers.
          </Text>
          <Input
            size="sm"
            placeholder="Enter ComicVine API key..."
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            fontFamily="mono"
            type="password"
          />
        </Box>

        {/* Folder configuration */}
        <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <HStack mb={3}>
            <FolderOpen size={16} />
            <Text fontWeight="semibold">Comic Folders</Text>
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
                placeholder="Add comic folder path..."
                value={newFolder}
                onChange={e => setNewFolder(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addFolder()}
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

export default ComicsSettings;
