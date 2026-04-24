import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Button, Flex, Heading, HStack, Input, Text, VStack,
} from '@chakra-ui/react';
import { useColorModeValue } from '../ui/color-mode';
import { useToast } from '../ui/toaster';
import { jsonStore } from '../../services/jsonstore';
import {
  RefreshCw, Check, Loader2, Download,
  Settings as SettingsIcon, Terminal,
} from 'lucide-react';
import { recipeAPI } from '../../services/api';
const PYPI_URL = 'https://pypi.org/pypi/okaasan/json';
const SETTINGS_COLLECTION = '_config';
const SETTINGS_KEY = '_settings';

function versionTuple(v: string): number[] {
  return v.split('.').map(Number);
}

function isNewer(latest: string, current: string): boolean {
  const a = versionTuple(latest);
  const b = versionTuple(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

interface UpdateCheck {
  current: string;
  latest: string;
  update_available: boolean;
}

interface SettingsData {
  auto_update?: boolean;
  update_interval_hours?: number;
}

export default function UpdateSettings() {
  const [updateCheck, setUpdateCheck] = useState<UpdateCheck | null>(null);
  const [settings, setSettings] = useState<SettingsData>({ auto_update: false, update_interval_hours: 24 });
  const [loading, setLoading] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);
  const [updateDone, setUpdateDone] = useState<any>(null);
  const { toast } = useToast();
  const logEndRef = useRef<HTMLDivElement>(null);

  const cardBg = useColorModeValue('#f8f9fa', '#16213e');
  const border = useColorModeValue('#e2e8f0', '#2d3748');
  const mutedText = useColorModeValue('#718096', '#a0aec0');

  const fetchUpdateInfo = useCallback(async () => {
    try {
      const [pypiRes, versionRes, stored] = await Promise.all([
        fetch(PYPI_URL).then(r => r.ok ? r.json() : null).catch(() => null),
        recipeAPI.getVersion().catch(() => null),
        jsonStore.get<SettingsData>(SETTINGS_COLLECTION, SETTINGS_KEY).catch(() => null),
      ]);
      if (stored) setSettings(s => ({ ...s, ...stored }));
      const current = versionRes?.version ?? '0.0.0';
      const latest = pypiRes?.info?.version ?? current;
      setUpdateCheck({
        current,
        latest,
        update_available: isNewer(latest, current),
      });
    } catch { /* silently ignore */ }
  }, []);

  useEffect(() => { fetchUpdateInfo(); }, [fetchUpdateInfo]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const saveSettings = async (updated: SettingsData) => {
    setSettings(updated);
    try {
      await jsonStore.put(SETTINGS_COLLECTION, SETTINGS_KEY, updated);
    } catch (e: any) {
      toast('error', `Failed to save settings: ${e.message}`);
    }
  };

  const startUpdate = async () => {
    setUpdating(true);
    setUpdateDone(null);
    setLogs([]);

    try {
      const res = await recipeAPI.triggerUpdate();
      if (!res.body) {
        toast('error', 'Streaming not supported');
        setUpdating(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n');
          let event = 'message';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7);
            else if (line.startsWith('data: ')) data = line.slice(6);
          }

          if (event === 'log') {
            setLogs(prev => [...prev, data]);
          } else if (event === 'done') {
            try {
              const result = JSON.parse(data);
              setUpdateDone(result);
              if (result.status === 'updated') {
                toast('success', 'Update installed successfully');
              } else if (result.status === 'error') {
                toast('error', result.message);
              } else {
                toast('success', 'Already up to date');
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (e: any) {
      setLogs(prev => [...prev, `Connection error: ${e.message}`]);
      toast('error', e.message);
    } finally {
      setUpdating(false);
      await fetchUpdateInfo();
    }
  };

  return (
    <Box p={6} maxW="800px" mx="auto">
      <Heading size="lg" mb={6}>
        <Flex align="center" gap={2}><Download size={24} /> Software Update</Flex>
      </Heading>

      {/* Version & Updates */}
      <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border} mb={4}>
        <Heading size="md" mb={3}>
          <Flex align="center" gap={2}>
            <SettingsIcon size={18} />
            Version & Updates
          </Flex>
        </Heading>

        {updateCheck && (
          <VStack align="stretch" gap={3}>
            <HStack gap={4}>
              <Box>
                <Text fontSize="xs" color={mutedText}>Installed</Text>
                <Text fontFamily="mono" fontWeight="bold">{updateCheck.current}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" color={mutedText}>Latest on PyPI</Text>
                <Text fontFamily="mono" fontWeight="bold">{updateCheck.latest}</Text>
              </Box>
              {updateCheck.update_available ? (
                <Box px={2} py={1} bg="orange.500" color="white" borderRadius="md" fontSize="xs" fontWeight="bold">
                  Update available
                </Box>
              ) : (
                <Box px={2} py={1} bg="green.500" color="white" borderRadius="md" fontSize="xs" fontWeight="bold">
                  Up to date
                </Box>
              )}
            </HStack>

            <HStack gap={2} flexWrap="wrap">
              <Button size="sm" onClick={async () => {
                setLoading('check');
                await fetchUpdateInfo();
                setLoading('');
              }} variant="outline" disabled={loading === 'check' || updating}>
                {loading === 'check' ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
                <Box ml={1}>Check for Updates</Box>
              </Button>

              {updateCheck.update_available && (
                <Button size="sm" colorPalette="orange" onClick={startUpdate}
                  disabled={updating}>
                  {updating ? <Loader2 className="spin" size={14} /> : <Download size={14} />}
                  <Box ml={1}>Install Update ({updateCheck.latest})</Box>
                </Button>
              )}
            </HStack>
          </VStack>
        )}

        {!updateCheck && (
          <Button size="sm" onClick={async () => {
            setLoading('check');
            await fetchUpdateInfo();
            setLoading('');
          }} disabled={loading === 'check'}>
            {loading === 'check' ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
            <Box ml={1}>Check for Updates</Box>
          </Button>
        )}
      </Box>

      {/* Live Update Log */}
      {(logs.length > 0 || updating) && (
        <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border} mb={4}>
          <Heading size="md" mb={3}>
            <Flex align="center" gap={2}>
              <Terminal size={18} />
              Update Log
              {updating && <Loader2 className="spin" size={14} />}
            </Flex>
          </Heading>
          <Box
            bg="gray.900" color="gray.100" p={3} borderRadius="md"
            fontFamily="mono" fontSize="xs" lineHeight="1.6"
            maxH="400px" overflowY="auto" whiteSpace="pre-wrap"
          >
            {logs.map((line, i) => (
              <Box key={i} color={
                line.startsWith('ERROR') ? 'red.300' :
                line.startsWith('WARNING') ? 'yellow.300' :
                line.startsWith('$') ? 'cyan.300' :
                'gray.100'
              }>
                {line}
              </Box>
            ))}
            {updating && logs.length === 0 && (
              <Text color="gray.500">Connecting...</Text>
            )}
            <div ref={logEndRef} />
          </Box>

          {updateDone && updateDone.status === 'updated' && (
            <Box mt={3} p={3} borderRadius="md" bg="green.900" color="white" fontSize="sm">
              <Text>Updated from {updateDone.from}{updateCheck ? ` to ${updateCheck.latest}` : ''}</Text>
              {updateDone.restarted ? (
                <Text fontSize="xs" mt={1}>Service is restarting. This page will reconnect shortly.</Text>
              ) : (
                <Text fontSize="xs" mt={1}>Restart the service manually to use the new version.</Text>
              )}
            </Box>
          )}

          {updateDone && updateDone.status === 'error' && (
            <Box mt={3} p={3} borderRadius="md" bg="red.900" color="white" fontSize="sm">
              <Text fontWeight="bold">{updateDone.message}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Auto-Update Settings */}
      <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border} mb={4}>
        <Heading size="md" mb={3}>
          <Flex align="center" gap={2}>
            <RefreshCw size={18} />
            Auto-Update
          </Flex>
        </Heading>
        <Text fontSize="sm" color={mutedText} mb={3}>
          When enabled, Okaasan will periodically check PyPI for new versions,
          install them, and restart the service automatically.
        </Text>

        <VStack align="stretch" gap={3}>
          <HStack gap={3}>
            <Button
              size="sm"
              colorPalette={settings.auto_update ? 'green' : undefined}
              variant={settings.auto_update ? 'solid' : 'outline'}
              onClick={async () => {
                const updated = { ...settings, auto_update: !settings.auto_update };
                await saveSettings(updated);
                toast('success', updated.auto_update ? 'Auto-update enabled' : 'Auto-update disabled');
              }}
            >
              {settings.auto_update ? <Check size={14} /> : null}
              <Box ml={settings.auto_update ? 1 : 0}>
                {settings.auto_update ? 'Enabled' : 'Disabled'}
              </Box>
            </Button>
            <Text fontSize="sm" color={mutedText}>
              Check every
            </Text>
            <Input
              w="80px" size="sm" type="number" min={1} max={168}
              value={settings.update_interval_hours}
              onChange={(e) => {
                const v = parseInt(e.target.value) || 24;
                setSettings(prev => ({ ...prev, update_interval_hours: v }));
              }}
              onBlur={async () => {
                await saveSettings(settings);
                toast('success', `Update interval set to ${settings.update_interval_hours}h`);
              }}
            />
            <Text fontSize="sm" color={mutedText}>hours</Text>
          </HStack>
        </VStack>
      </Box>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </Box>
  );
}
