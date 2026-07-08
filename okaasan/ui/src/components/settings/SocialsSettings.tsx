import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Text, Heading, Input, Button, Badge } from '@chakra-ui/react';
import { Share2, ArrowLeft, FolderOpen, Save } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface PlatformConfig {
  path: string;
  default_path: string;
  configured: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
};

const SocialsSettings: React.FC = () => {
  const navigate = useNavigate();
  const [dumps, setDumps] = useState<Record<string, PlatformConfig>>({});
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    recipeAPI.getSocialsConfig()
      .then((data) => {
        setDumps(data.dumps);
        const initial: Record<string, string> = {};
        for (const [key, cfg] of Object.entries(data.dumps)) {
          initial[key] = cfg.path || '';
        }
        setPaths(initial);
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await recipeAPI.updateSocialsConfig(paths);
      const updated = await recipeAPI.getSocialsConfig();
      setDumps(updated.dumps);
      setSaved(true);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box maxW="3xl" mx="auto" p={6}>
      <VStack align="stretch" gap={6}>
        <HStack>
          <Button size="sm" variant="ghost" onClick={() => navigate('/settings')}>
            <ArrowLeft size={16} />
          </Button>
          <Share2 size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Socials Data Dumps</Heading>
        </HStack>

        <Text fontSize="sm" color="var(--muted-text)">
          Point each platform to its extracted export folder. Data stays in <code>private/</code> or
          <code>dumps/</code> and is never included in the static site build.
        </Text>

        {Object.entries(PLATFORM_LABELS).map(([id, label]) => {
          const cfg = dumps[id];
          return (
            <Box
              key={id}
              p={4}
              bg="var(--card-bg)"
              border="1px solid"
              borderColor="var(--border-color)"
              borderRadius="lg"
            >
              <VStack align="stretch" gap={3}>
                <HStack justify="space-between">
                  <Text fontWeight="semibold" color="var(--heading-color)">{label}</Text>
                  {cfg && (
                    <Badge colorPalette={cfg.configured ? 'green' : 'gray'} variant="subtle">
                      {cfg.configured ? 'Dump found' : 'Not found'}
                    </Badge>
                  )}
                </HStack>

                <HStack>
                  <FolderOpen size={16} color="var(--muted-text)" />
                  <Input
                    size="sm"
                    placeholder={cfg?.default_path || `dumps/${id}/`}
                    value={paths[id] || ''}
                    onChange={(e) => setPaths((prev) => ({ ...prev, [id]: e.target.value }))}
                    bg="var(--input-bg)"
                    borderColor="var(--border-color)"
                    fontFamily="mono"
                    fontSize="sm"
                  />
                </HStack>

                <Text fontSize="xs" color="var(--empty-text)">
                  Default: <code>{cfg?.default_path}</code>
                </Text>
              </VStack>
            </Box>
          );
        })}

        <HStack>
          <Button size="sm" colorPalette="blue" onClick={handleSave} disabled={saving}>
            <Save size={14} />
            {saving ? 'Saving...' : 'Save paths'}
          </Button>
          {saved && <Text fontSize="sm" color="green.500">Saved</Text>}
        </HStack>

        <Box p={4} bg="var(--surface-muted)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <Text fontSize="sm" fontWeight="semibold" mb={2} color="var(--heading-color)">Expected export structure</Text>
          <VStack align="stretch" gap={2}>
            <Text fontSize="sm" color="var(--muted-text)">
              <strong>Instagram / Facebook (Meta):</strong> unzip the download into
              <code>dumps/instagram/</code> or <code>dumps/facebook/</code> at the repo root
              (auto-detected), or set a custom path below.
            </Text>
            <Text fontSize="sm" color="var(--muted-text)">
              <strong>LinkedIn:</strong> unzip the archive; point to the folder with CSV/JSON files
              (e.g. <code>Connections.csv</code>, <code>Shares.csv</code>).
            </Text>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
};

export default SocialsSettings;
