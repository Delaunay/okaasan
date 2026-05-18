import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Text, Heading, Input, Button, Badge, Spinner } from '@chakra-ui/react';
import { Music, ArrowLeft, FolderOpen, Trash2, RefreshCw, Globe, Image } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface MusicLibraryStatus {
  configured: boolean;
  folders: string[];
  total_files: number;
  matched_files: number;
  unmatched_files: number;
  last_scan: string | null;
  metadata_enabled: boolean;
  fetch_covers: boolean;
  contact_email: string;
}

const MusicSettings: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<MusicLibraryStatus | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [newFolder, setNewFolder] = useState('');
  const [metadataEnabled, setMetadataEnabled] = useState(false);
  const [fetchCovers, setFetchCovers] = useState(true);
  const [contactEmail, setContactEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    recipeAPI.request<MusicLibraryStatus>('/music/library/status')
      .then(data => {
        setStatus(data);
        setFolders(data.folders);
        setMetadataEnabled(data.metadata_enabled);
        setFetchCovers(data.fetch_covers);
        setContactEmail(data.contact_email || '');
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await recipeAPI.request('/music/library/configure', {
        method: 'POST',
        body: JSON.stringify({ folders, metadata_enabled: metadataEnabled, fetch_covers: fetchCovers, contact_email: contactEmail }),
      });
      const updated = await recipeAPI.request<MusicLibraryStatus>('/music/library/status');
      setStatus(updated);
      window.dispatchEvent(new Event('sidebar-config-changed'));
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleScan = async (force = false) => {
    setScanning(true);
    try {
      await recipeAPI.request('/music/library/scan', {
        method: 'POST',
        body: JSON.stringify({ force }),
      });
      const updated = await recipeAPI.request<MusicLibraryStatus>('/music/library/status');
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
          <Music size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Music Library</Heading>
        </HStack>

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
            <HStack mt={3} gap={2}>
              <Button
                size="sm"
                onClick={() => handleScan(false)}
                disabled={scanning}
              >
                {scanning ? <Spinner size="xs" /> : <RefreshCw size={14} />}
                <Text ml={1}>{scanning ? 'Scanning...' : 'Scan Now'}</Text>
              </Button>
              <Button
                size="sm"
                variant="outline"
                colorPalette="orange"
                onClick={() => handleScan(true)}
                disabled={scanning}
                title="Clear all file entries and re-scan from scratch — re-reads tags and folder structure"
              >
                <Text>{scanning ? 'Scanning...' : 'Force Full Re-scan'}</Text>
              </Button>
            </HStack>
          </Box>
        )}

        <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <HStack mb={3}>
            <FolderOpen size={16} />
            <Text fontWeight="semibold">Music Folders</Text>
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
                placeholder="Add music folder path..."
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

        <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <HStack mb={3}>
            <Globe size={16} />
            <Text fontWeight="semibold">MusicBrainz API</Text>
            <Badge colorPalette={metadataEnabled ? 'green' : 'gray'} fontSize="xs">
              {metadataEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </HStack>
          <Text fontSize="sm" color="var(--muted-text)" mb={3}>
            MusicBrainz provides free metadata enrichment (album info, artist details, release year) and cover art from the Cover Art Archive. No API key required.
          </Text>
          <VStack align="stretch" gap={3}>
            <HStack>
              <Button
                size="sm"
                colorPalette={metadataEnabled ? 'green' : 'gray'}
                variant={metadataEnabled ? 'solid' : 'outline'}
                onClick={() => setMetadataEnabled(!metadataEnabled)}
              >
                {metadataEnabled ? 'Metadata Lookup Enabled' : 'Enable Metadata Lookup'}
              </Button>
            </HStack>
            {metadataEnabled && (
              <>
                <HStack>
                  <Image size={14} color="var(--muted-text)" />
                  <Button
                    size="sm"
                    colorPalette={fetchCovers ? 'blue' : 'gray'}
                    variant={fetchCovers ? 'solid' : 'outline'}
                    onClick={() => setFetchCovers(!fetchCovers)}
                  >
                    {fetchCovers ? 'Cover Art Download Enabled' : 'Enable Cover Art Download'}
                  </Button>
                </HStack>
                <Box>
                  <Text fontSize="xs" color="var(--muted-text)" mb={1}>
                    Contact email (recommended by MusicBrainz for rate limiting courtesy)
                  </Text>
                  <Input
                    size="sm"
                    placeholder="your@email.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    maxW="300px"
                  />
                </Box>
              </>
            )}
          </VStack>
        </Box>

        <Button onClick={handleSave} disabled={saving} colorPalette="blue">
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </VStack>
    </Box>
  );
};

export default MusicSettings;
