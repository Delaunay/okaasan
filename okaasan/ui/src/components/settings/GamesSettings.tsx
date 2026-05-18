import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Text, Heading, Input, Button, Badge } from '@chakra-ui/react';
import { Gamepad2, ArrowLeft, ExternalLink, Check, FolderOpen, RefreshCw } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface GamesConfig {
  igdb_client_id: string;
  igdb_client_secret: string;
  rom_folders: string[];
  configured: boolean;
}

interface ScanStatus {
  scanning: boolean;
  last_scan?: string;
  games_found?: number;
}

const GamesSettings: React.FC = () => {
  const navigate = useNavigate();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [romFolders, setRomFolders] = useState<string[]>([]);
  const [newFolder, setNewFolder] = useState('');
  const [config, setConfig] = useState<GamesConfig | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    recipeAPI.request<GamesConfig>('/games/settings')
      .then(data => {
        setConfig(data);
        setRomFolders(data.rom_folders || []);
      })
      .catch(console.error);

    recipeAPI.request<ScanStatus>('/games/scan/status')
      .then(setScanStatus)
      .catch(console.error);
  }, []);

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      await recipeAPI.request('/games/settings/credentials', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      setConfig(prev => prev ? { ...prev, configured: true } : prev);
      setSaved(true);
      setClientId('');
      setClientSecret('');
      window.dispatchEvent(new Event('sidebar-config-changed'));
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleAddFolder = async () => {
    if (!newFolder.trim()) return;
    const updated = [...romFolders, newFolder.trim()];
    try {
      await recipeAPI.request('/games/settings/folders', {
        method: 'POST',
        body: JSON.stringify({ folders: updated }),
      });
      setRomFolders(updated);
      setNewFolder('');
      window.dispatchEvent(new Event('sidebar-config-changed'));
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveFolder = async (idx: number) => {
    const updated = romFolders.filter((_, i) => i !== idx);
    try {
      await recipeAPI.request('/games/settings/folders', {
        method: 'POST',
        body: JSON.stringify({ folders: updated }),
      });
      setRomFolders(updated);
      window.dispatchEvent(new Event('sidebar-config-changed'));
    } catch (e) {
      console.error(e);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      await recipeAPI.request('/games/scan', { method: 'POST' });
      const status = await recipeAPI.request<ScanStatus>('/games/scan/status');
      setScanStatus(status);
    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  };

  return (
    <Box maxW="3xl" mx="auto" p={6}>
      <VStack align="stretch" gap={6}>
        <HStack>
          <Button size="sm" variant="ghost" onClick={() => navigate('/settings')}>
            <ArrowLeft size={16} />
          </Button>
          <Gamepad2 size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Retro Games</Heading>
        </HStack>

        {/* IGDB Credentials */}
        <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <VStack align="stretch" gap={4}>
            <HStack justify="space-between">
              <Text fontWeight="semibold">IGDB / Twitch API</Text>
              {config?.configured ? (
                <Badge colorPalette="green">Configured</Badge>
              ) : (
                <Badge colorPalette="orange">Not configured</Badge>
              )}
            </HStack>

            <Text fontSize="sm" color="var(--muted-text)">
              IGDB provides game metadata (cover art, descriptions, genres).
              Get Twitch API credentials from{' '}
              <Text as="a" href="https://dev.twitch.tv/console/apps" target="_blank" color="var(--icon-color)">
                dev.twitch.tv <ExternalLink size={12} style={{ display: 'inline' }} />
              </Text>
            </Text>

            <Input
              placeholder="Twitch Client ID"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              bg="var(--input-bg)"
            />
            <Input
              placeholder="Twitch Client Secret"
              value={clientSecret}
              onChange={e => setClientSecret(e.target.value)}
              bg="var(--input-bg)"
              type="password"
            />

            <HStack>
              <Button
                size="sm"
                colorPalette="blue"
                onClick={handleSaveCredentials}
                disabled={!clientId.trim() || !clientSecret.trim() || saving}
              >
                {saving ? 'Saving...' : 'Save Credentials'}
              </Button>
              {saved && (
                <HStack color="green.500">
                  <Check size={16} />
                  <Text fontSize="sm">Saved successfully</Text>
                </HStack>
              )}
            </HStack>
          </VStack>
        </Box>

        {/* ROM Folders */}
        <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <VStack align="stretch" gap={4}>
            <HStack>
              <FolderOpen size={18} />
              <Text fontWeight="semibold">ROM Folders</Text>
            </HStack>

            <Text fontSize="sm" color="var(--muted-text)">
              Add directories containing your ROM files. Supported formats depend on the emulator core
              (e.g. .nes, .sfc, .gba, .z64, .bin/.cue).
            </Text>

            {romFolders.length > 0 && (
              <VStack align="stretch" gap={1}>
                {romFolders.map((folder, idx) => (
                  <HStack key={idx} justify="space-between" p={2} bg="var(--surface-muted)" borderRadius="md">
                    <Text fontSize="sm" fontFamily="mono">{folder}</Text>
                    <Button
                      size="xs"
                      variant="ghost"
                      colorPalette="red"
                      onClick={() => handleRemoveFolder(idx)}
                    >
                      Remove
                    </Button>
                  </HStack>
                ))}
              </VStack>
            )}

            <HStack>
              <Input
                placeholder="/path/to/roms"
                value={newFolder}
                onChange={e => setNewFolder(e.target.value)}
                bg="var(--input-bg)"
                size="sm"
                onKeyDown={e => e.key === 'Enter' && handleAddFolder()}
              />
              <Button size="sm" onClick={handleAddFolder} disabled={!newFolder.trim()}>
                Add
              </Button>
            </HStack>
          </VStack>
        </Box>

        {/* Scan */}
        <Box p={4} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <VStack align="stretch" gap={4}>
            <HStack justify="space-between">
              <HStack>
                <RefreshCw size={18} />
                <Text fontWeight="semibold">Library Scan</Text>
              </HStack>
              {scanStatus?.games_found != null && (
                <Badge colorPalette="blue">{scanStatus.games_found} games</Badge>
              )}
            </HStack>

            {scanStatus?.last_scan && (
              <Text fontSize="sm" color="var(--muted-text)">
                Last scan: {new Date(scanStatus.last_scan).toLocaleString()}
              </Text>
            )}

            <Button
              size="sm"
              colorPalette="blue"
              onClick={handleScan}
              disabled={scanning || romFolders.length === 0}
            >
              <RefreshCw size={14} />
              {scanning ? 'Scanning...' : 'Scan for Games'}
            </Button>
          </VStack>
        </Box>

        {/* Info */}
        <Box p={4} bg="var(--surface-muted)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <Text fontSize="sm" fontWeight="semibold" mb={2} color="var(--heading-color)">What this enables:</Text>
          <VStack align="stretch" gap={1}>
            <Text fontSize="sm" color="var(--muted-text)">• In-browser emulation via EmulatorJS (NES, SNES, N64, GBA, Genesis, PS1, and more)</Text>
            <Text fontSize="sm" color="var(--muted-text)">• Cover art and metadata from IGDB</Text>
            <Text fontSize="sm" color="var(--muted-text)">• Save states with screenshots</Text>
            <Text fontSize="sm" color="var(--muted-text)">• ROM files are served locally — no uploads needed</Text>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
};

export default GamesSettings;
