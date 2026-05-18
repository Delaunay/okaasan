import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Text, Heading, Input, Button, Badge, Spinner } from '@chakra-ui/react';
import { BookOpen, ArrowLeft, FolderOpen, Trash2, RefreshCw } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface BooksLibraryStatus {
  configured: boolean;
  folders: string[];
  total_books: number;
  formats: Record<string, number>;
  last_scan: string | null;
}

const BooksSettings: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<BooksLibraryStatus | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [newFolder, setNewFolder] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    recipeAPI.request<BooksLibraryStatus>('/books/library/status')
      .then(data => {
        setStatus(data);
        setFolders(data.folders);
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await recipeAPI.request('/books/library/configure', {
        method: 'POST',
        body: JSON.stringify({ folders }),
      });
      const updated = await recipeAPI.request<BooksLibraryStatus>('/books/library/status');
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
      await recipeAPI.request('/books/library/scan', { method: 'POST' });
      const updated = await recipeAPI.request<BooksLibraryStatus>('/books/library/status');
      setStatus(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  };

  const addFolder = () => {
    const path = newFolder.trim();
    if (!path || folders.includes(path)) return;
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
          <BookOpen size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Books Library</Heading>
        </HStack>

        {status && (
          <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
            <HStack gap={4} flexWrap="wrap">
              <Box>
                <Text fontSize="xs" color="var(--muted-text)">Total Books</Text>
                <Text fontSize="lg" fontWeight="bold">{status.total_books}</Text>
              </Box>
              {Object.entries(status.formats).map(([fmt, count]) => (
                <Box key={fmt}>
                  <Text fontSize="xs" color="var(--muted-text)">{fmt}</Text>
                  <Text fontSize="lg" fontWeight="bold">{count}</Text>
                </Box>
              ))}
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
            <FolderOpen size={16} />
            <Text fontWeight="semibold">Book Folders</Text>
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
                placeholder="Add book folder path..."
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

export default BooksSettings;
