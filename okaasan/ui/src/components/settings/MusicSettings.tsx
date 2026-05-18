import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Text, Heading, Input, Button, Badge, Spinner } from '@chakra-ui/react';
import { Music, ArrowLeft, FolderOpen, Trash2, RefreshCw, Globe, Image, Upload } from 'lucide-react';
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
  const [spotifyDir, setSpotifyDir] = useState('');
  const [spotifyImporting, setSpotifyImporting] = useState(false);
  const [spotifyResult, setSpotifyResult] = useState<any>(null);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);

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

  const handleSpotifyImport = async () => {
    setSpotifyImporting(true);
    setSpotifyResult(null);
    setSpotifyError(null);
    try {
      const body: any = {};
      if (spotifyDir.trim()) body.dump_dir = spotifyDir.trim();
      const resp = await fetch('/api/music/import/spotify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || resp.statusText);
      }
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No response stream');
      let lastResult: any = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.error) throw new Error(evt.error);
            lastResult = evt;
            if (evt.progress) {
              setSpotifyResult({ ...evt.progress });
            }
          } catch (e: any) {
            if (e.message && e.message !== 'Unexpected end of JSON input') {
              throw e;
            }
          }
        }
      }
      if (lastResult?.done) setSpotifyResult(lastResult);
    } catch (e: any) {
      setSpotifyError(e.message || 'Import failed');
    } finally {
      setSpotifyImporting(false);
    }
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

        <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <HStack mb={3}>
            <Upload size={16} />
            <Text fontWeight="semibold">Spotify Import</Text>
            {spotifyImporting && <Badge colorPalette="blue" fontSize="xs">Importing...</Badge>}
          </HStack>
          <Text fontSize="sm" color="var(--muted-text)" mb={3}>
            Import your Spotify Extended Streaming History. Request your data from Spotify's privacy settings, extract the ZIP, and point to the folder containing the JSON files.
          </Text>
          <VStack align="stretch" gap={3}>
            <Box>
              <Text fontSize="xs" color="var(--muted-text)" mb={1}>
                Path to extracted Spotify dump folder
              </Text>
              <Input
                size="sm"
                placeholder="/path/to/Spotify Extended Streaming History"
                value={spotifyDir}
                onChange={(e) => setSpotifyDir(e.target.value)}
                fontFamily="mono"
              />
            </Box>
            <HStack>
              <Button
                size="sm"
                colorPalette="green"
                onClick={handleSpotifyImport}
                disabled={spotifyImporting}
              >
                {spotifyImporting ? <Spinner size="xs" /> : <Upload size={14} />}
                <Text ml={1}>{spotifyImporting ? 'Importing...' : 'Import Spotify History'}</Text>
              </Button>
            </HStack>
            {spotifyError && (
              <Box p={3} bg="red.50" borderColor="red.200" border="1px solid" borderRadius="md">
                <Text fontSize="sm" color="red.600">{spotifyError}</Text>
              </Box>
            )}
            {spotifyResult && (
              <Box p={3} bg="var(--surface-muted)" borderRadius="md">
                <HStack gap={4} flexWrap="wrap">
                  {spotifyResult.total_processed != null && (
                    <Box>
                      <Text fontSize="xs" color="var(--muted-text)">Processed</Text>
                      <Text fontSize="sm" fontWeight="bold">{spotifyResult.total_processed.toLocaleString()}</Text>
                    </Box>
                  )}
                  {spotifyResult.tracks_created != null && (
                    <Box>
                      <Text fontSize="xs" color="var(--muted-text)">Tracks Created</Text>
                      <Text fontSize="sm" fontWeight="bold">{spotifyResult.tracks_created.toLocaleString()}</Text>
                    </Box>
                  )}
                  {spotifyResult.music_plays_imported != null && (
                    <Box>
                      <Text fontSize="xs" color="var(--muted-text)">Music Plays</Text>
                      <Text fontSize="sm" fontWeight="bold">{spotifyResult.music_plays_imported.toLocaleString()}</Text>
                    </Box>
                  )}
                  {spotifyResult.podcast_plays_imported != null && (
                    <Box>
                      <Text fontSize="xs" color="var(--muted-text)">Podcast Plays</Text>
                      <Text fontSize="sm" fontWeight="bold">{spotifyResult.podcast_plays_imported.toLocaleString()}</Text>
                    </Box>
                  )}
                </HStack>
              </Box>
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
