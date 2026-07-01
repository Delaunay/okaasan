import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Text, Heading, Input, Button, Badge, Spinner } from '@chakra-ui/react';
import { Music, ArrowLeft, FolderOpen, Trash2, RefreshCw, Globe, Image, Upload, Database, ArrowRightLeft, EyeOff, X } from 'lucide-react';
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
  const [backfillStatus, setBackfillStatus] = useState<{ total_tracks: number; missing_covers: number; has_covers: number } | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<any>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [backfillArtist, setBackfillArtist] = useState('');
  const [backfillLimit, setBackfillLimit] = useState('100');
  const [historyStats, setHistoryStats] = useState<any>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [ignoredArtists, setIgnoredArtists] = useState<string[]>([]);
  const [newIgnored, setNewIgnored] = useState('');
  const [ignoredSaving, setIgnoredSaving] = useState(false);

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

    recipeAPI.request<{ artists: string[] }>('/music/ignored-artists')
      .then(data => setIgnoredArtists(data.artists))
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

  const saveIgnoredArtists = async (artists: string[]) => {
    setIgnoredSaving(true);
    try {
      const data = await recipeAPI.request<{ artists: string[] }>('/music/ignored-artists', {
        method: 'PUT',
        body: JSON.stringify({ artists }),
      });
      setIgnoredArtists(data.artists);
    } catch (e) {
      console.error(e);
    } finally {
      setIgnoredSaving(false);
    }
  };

  const addIgnoredArtist = () => {
    const name = newIgnored.trim();
    if (!name || ignoredArtists.some(a => a.toLowerCase() === name.toLowerCase())) return;
    const updated = [...ignoredArtists, name];
    setIgnoredArtists(updated);
    setNewIgnored('');
    saveIgnoredArtists(updated);
  };

  const removeIgnoredArtist = (idx: number) => {
    const updated = ignoredArtists.filter((_, i) => i !== idx);
    setIgnoredArtists(updated);
    saveIgnoredArtists(updated);
  };

  const fetchBackfillStatus = useCallback(() => {
    recipeAPI.request<{ total_tracks: number; missing_covers: number; has_covers: number }>('/music/backfill-covers/status')
      .then(setBackfillStatus)
      .catch(console.error);
  }, []);

  useEffect(() => { fetchBackfillStatus(); }, [fetchBackfillStatus]);

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    setBackfillError(null);
    try {
      const body: any = {};
      const lim = parseInt(backfillLimit, 10);
      if (!isNaN(lim) && lim > 0) body.limit = lim;
      if (backfillArtist.trim()) body.artist = backfillArtist.trim();

      const resp = await fetch('/api/music/backfill-covers', {
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
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.error) throw new Error(evt.error);
            if (evt.progress) setBackfillResult({ ...evt.progress });
            if (evt.done) { setBackfillResult(evt); fetchBackfillStatus(); }
          } catch (e: any) {
            if (e.message && e.message !== 'Unexpected end of JSON input') throw e;
          }
        }
      }
    } catch (e: any) {
      setBackfillError(e.message || 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  };

  const fetchHistoryStats = useCallback(() => {
    fetch('/api/music/import/history-stats')
      .then(r => r.json())
      .then(setHistoryStats)
      .catch(console.error);
  }, []);

  useEffect(() => { fetchHistoryStats(); }, [fetchHistoryStats]);

  const handleMigrate = async () => {
    setMigrating(true);
    setMigrationResult(null);
    setMigrationError(null);
    try {
      const resp = await fetch('/api/music/import/migrate-history', { method: 'POST' });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || resp.statusText);
      }
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No response stream');
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.error) throw new Error(evt.error);
            if (evt.progress) setMigrationResult({ ...evt.progress });
            if (evt.done) { setMigrationResult(evt); fetchHistoryStats(); }
          } catch (e: any) {
            if (e.message && e.message !== 'Unexpected end of JSON input') throw e;
          }
        }
      }
    } catch (e: any) {
      setMigrationError(e.message || 'Migration failed');
    } finally {
      setMigrating(false);
    }
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
      if (lastResult?.done) { setSpotifyResult(lastResult); fetchHistoryStats(); }
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

        {backfillStatus && backfillStatus.missing_covers > 0 && (
          <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
            <HStack mb={3}>
              <Image size={16} />
              <Text fontWeight="semibold">Cover Art Backfill</Text>
              {backfilling && <Badge colorPalette="blue" fontSize="xs">Running...</Badge>}
              <Badge colorPalette="orange" fontSize="xs">
                {backfillStatus.missing_covers.toLocaleString()} missing
              </Badge>
            </HStack>
            <Text fontSize="sm" color="var(--muted-text)" mb={3}>
              {backfillStatus.missing_covers.toLocaleString()} of {backfillStatus.total_tracks.toLocaleString()} tracks
              ({Math.round(backfillStatus.missing_covers / backfillStatus.total_tracks * 100)}%) are missing cover art.
              Search MusicBrainz to find and download covers automatically. Tracks are grouped by album for efficiency.
            </Text>
            <VStack align="stretch" gap={3}>
              <HStack gap={3}>
                <Box flex={1}>
                  <Text fontSize="xs" color="var(--muted-text)" mb={1}>Batch limit (tracks)</Text>
                  <Input
                    size="sm"
                    type="number"
                    value={backfillLimit}
                    onChange={(e) => setBackfillLimit(e.target.value)}
                    maxW="120px"
                  />
                </Box>
                <Box flex={2}>
                  <Text fontSize="xs" color="var(--muted-text)" mb={1}>Filter by artist (optional)</Text>
                  <Input
                    size="sm"
                    placeholder="e.g. Radiohead"
                    value={backfillArtist}
                    onChange={(e) => setBackfillArtist(e.target.value)}
                  />
                </Box>
              </HStack>
              <HStack>
                <Button
                  size="sm"
                  colorPalette="purple"
                  onClick={handleBackfill}
                  disabled={backfilling}
                >
                  {backfilling ? <Spinner size="xs" /> : <Image size={14} />}
                  <Text ml={1}>{backfilling ? 'Backfilling...' : 'Backfill Covers'}</Text>
                </Button>
              </HStack>
              {backfillError && (
                <Box p={3} bg="var(--panel-red-bg)" borderColor="var(--panel-red-border)" border="1px solid" borderRadius="md">
                  <Text fontSize="sm" color="var(--panel-red-text)">{backfillError}</Text>
                </Box>
              )}
              {backfillResult && (
                <Box p={3} bg="var(--surface-muted)" borderRadius="md">
                  {backfillResult.current_artist && !backfillResult.done && (
                    <Text fontSize="xs" color="var(--muted-text)" mb={2}>
                      Processing: {backfillResult.current_artist} — {backfillResult.current_album || '(no album)'}
                    </Text>
                  )}
                  <HStack gap={4} flexWrap="wrap">
                    {backfillResult.groups_processed != null && (
                      <Box>
                        <Text fontSize="xs" color="var(--muted-text)">Groups</Text>
                        <Text fontSize="sm" fontWeight="bold">
                          {backfillResult.groups_processed} / {backfillResult.total_groups}
                        </Text>
                      </Box>
                    )}
                    {backfillResult.covers_found != null && (
                      <Box>
                        <Text fontSize="xs" color="var(--muted-text)">Covers Found</Text>
                        <Text fontSize="sm" fontWeight="bold" color="green">{backfillResult.covers_found}</Text>
                      </Box>
                    )}
                    {backfillResult.tracks_updated != null && (
                      <Box>
                        <Text fontSize="xs" color="var(--muted-text)">Tracks Updated</Text>
                        <Text fontSize="sm" fontWeight="bold" color="green">{backfillResult.tracks_updated}</Text>
                      </Box>
                    )}
                    {backfillResult.covers_not_found != null && (
                      <Box>
                        <Text fontSize="xs" color="var(--muted-text)">Not Found</Text>
                        <Text fontSize="sm" fontWeight="bold" color="var(--muted-text)">{backfillResult.covers_not_found}</Text>
                      </Box>
                    )}
                    {backfillResult.errors != null && backfillResult.errors > 0 && (
                      <Box>
                        <Text fontSize="xs" color="var(--muted-text)">Errors</Text>
                        <Text fontSize="sm" fontWeight="bold" color="orange">{backfillResult.errors}</Text>
                      </Box>
                    )}
                  </HStack>
                </Box>
              )}
            </VStack>
          </Box>
        )}

        <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <HStack mb={3}>
            <EyeOff size={16} />
            <Text fontWeight="semibold">Ignored Artists</Text>
            <Badge colorPalette="gray" fontSize="xs">{ignoredArtists.length} artists</Badge>
            {ignoredSaving && <Spinner size="xs" />}
          </HStack>
          <Text fontSize="sm" color="var(--muted-text)" mb={3}>
            Artists listed here are hidden from stats, top artists, library views, and discovery. Tracks are kept in the database but excluded from display.
          </Text>
          <VStack align="stretch" gap={2}>
            {ignoredArtists.map((name, idx) => (
              <HStack key={idx} p={2} bg="var(--surface-muted)" borderRadius="md">
                <EyeOff size={14} color="var(--muted-text)" />
                <Text fontSize="sm" flex={1}>{name}</Text>
                <Button size="xs" variant="ghost" colorPalette="red" onClick={() => removeIgnoredArtist(idx)}>
                  <X size={12} />
                </Button>
              </HStack>
            ))}
            <HStack>
              <Input
                size="sm"
                placeholder="Artist name to ignore..."
                value={newIgnored}
                onChange={(e) => setNewIgnored(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addIgnoredArtist()}
              />
              <Button size="sm" onClick={addIgnoredArtist} disabled={!newIgnored.trim()}>
                Add
              </Button>
            </HStack>
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

        {historyStats && (
          <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
            <HStack mb={3}>
              <Database size={16} />
              <Text fontWeight="semibold">Listening History</Text>
              {historyStats.years?.length > 0 && (
                <Badge colorPalette="blue" fontSize="xs">
                  {historyStats.years.length} year DBs
                </Badge>
              )}
            </HStack>

            {historyStats.needs_migration && (
              <Box p={3} mb={3} bg="orange.50" border="1px solid" borderColor="orange.200" borderRadius="md">
                <Text fontSize="sm" fontWeight="semibold" color="orange.700" mb={1}>Migration Available</Text>
                <Text fontSize="sm" color="orange.600" mb={2}>
                  {historyStats.main_db_music_rows.toLocaleString()} music + {historyStats.main_db_podcast_rows.toLocaleString()} podcast rows are still in the main database.
                  Migrate them to per-year databases to reduce main DB size.
                </Text>
                <Button
                  size="sm"
                  colorPalette="orange"
                  onClick={handleMigrate}
                  disabled={migrating}
                >
                  {migrating ? <Spinner size="xs" /> : <ArrowRightLeft size={14} />}
                  <Text ml={1}>{migrating ? 'Migrating...' : 'Migrate Now'}</Text>
                </Button>
                {migrationError && (
                  <Box mt={2} p={2} bg="red.50" border="1px solid" borderColor="red.200" borderRadius="md">
                    <Text fontSize="sm" color="red.600">{migrationError}</Text>
                  </Box>
                )}
                {migrationResult && (
                  <Box mt={2} p={2} bg="var(--surface-muted)" borderRadius="md">
                    <Text fontSize="sm">
                      {migrationResult.phase === 'done' ? 'Migration complete: ' : `${migrationResult.phase}: `}
                      {migrationResult.music_rows_migrated?.toLocaleString()} music
                      {migrationResult.podcast_rows_migrated != null && ` + ${migrationResult.podcast_rows_migrated.toLocaleString()} podcast`} rows
                    </Text>
                  </Box>
                )}
              </Box>
            )}

            {historyStats.years?.length > 0 ? (
              <VStack align="stretch" gap={1}>
                {historyStats.years.map((y: any) => (
                  <HStack key={y.year} p={2} bg="var(--surface-muted)" borderRadius="md" justify="space-between">
                    <Text fontSize="sm" fontWeight="semibold" fontFamily="mono">{y.year}</Text>
                    <HStack gap={4}>
                      <Box textAlign="right">
                        <Text fontSize="xs" color="var(--muted-text)">Music</Text>
                        <Text fontSize="sm">{y.music_plays.toLocaleString()}</Text>
                      </Box>
                      <Box textAlign="right">
                        <Text fontSize="xs" color="var(--muted-text)">Podcasts</Text>
                        <Text fontSize="sm">{y.podcast_plays.toLocaleString()}</Text>
                      </Box>
                      <Box textAlign="right">
                        <Text fontSize="xs" color="var(--muted-text)">Size</Text>
                        <Text fontSize="sm">{y.size_mb} MB</Text>
                      </Box>
                    </HStack>
                  </HStack>
                ))}
              </VStack>
            ) : (
              !historyStats.needs_migration && (
                <Text fontSize="sm" color="var(--muted-text)">
                  No listening history data yet. Import Spotify streaming history above.
                </Text>
              )
            )}
          </Box>
        )}

        <Button onClick={handleSave} disabled={saving} colorPalette="blue">
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </VStack>
    </Box>
  );
};

export default MusicSettings;
