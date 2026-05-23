import { FC, useEffect, useState } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { Server, Cpu, HardDrive, MemoryStick, Power, RotateCcw, Clock } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface Computer {
  id: string;
  name: string;
  hostname: string;
  os: string;
  arch: string;
  cpu_count: number;
  cpu_pct: number;
  ram_total: number;
  ram_used: number;
  ram_pct: number;
  disk_total: number;
  disk_used: number;
  disk_pct: number;
  uptime_sec: number;
  status: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
}

function formatUptime(sec: number): string {
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((sec % 3600) / 60);
  return `${hours}h ${mins}m`;
}

const UsageBar: FC<{ pct: number; color?: string }> = ({ pct, color = 'orange' }) => {
  const barColor = pct > 90 ? 'red.500' : pct > 70 ? 'orange.400' : 'green.400';
  return (
    <Box w="100%" h="6px" borderRadius="full" bg="var(--surface-muted)" overflow="hidden">
      <Box h="100%" w={`${Math.min(pct, 100)}%`} bg={color === 'auto' ? barColor : barColor} borderRadius="full" transition="width 0.3s" />
    </Box>
  );
};

const ComputersOverview: FC = () => {
  const [computers, setComputers] = useState<Computer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    recipeAPI.getComputers()
      .then(setComputers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleAction = async (id: string, action: 'shutdown' | 'restart') => {
    if (!confirm(`Are you sure you want to ${action} this computer?`)) return;
    setActionLoading(`${id}-${action}`);
    try {
      if (action === 'shutdown') await recipeAPI.shutdownComputer(id);
      else await recipeAPI.restartComputer(id);
    } catch (err) {
      console.error(`Failed to ${action}:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  return (
    <VStack gap={8} align="stretch" p={4}>
      <HStack>
        <Server size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)">Computers</Heading>
      </HStack>

      {computers.length === 0 ? (
        <Flex justify="center" py={12}>
          <Text color="var(--muted-text)">No computers found.</Text>
        </Flex>
      ) : (
        <Grid templateColumns="repeat(auto-fill, minmax(320px, 1fr))" gap={4}>
          {computers.map((pc) => (
            <Box
              key={pc.id}
              p={5}
              borderRadius="lg"
              border="1px solid"
              borderColor="var(--border-color)"
              bg="var(--card-bg)"
              cursor="pointer"
              transition="transform 0.2s, box-shadow 0.2s"
              _hover={{ transform: 'translateY(-2px)', boxShadow: 'md' }}
              onClick={() => navigate(`/computers/${pc.id}`)}
            >
              <HStack justify="space-between" mb={4}>
                <HStack gap={3}>
                  <Box p={2} borderRadius="md" bg="var(--surface-muted)">
                    <Server size={20} color="var(--icon-color)" />
                  </Box>
                  <Box>
                    <Text fontWeight="bold" fontSize="md">{pc.hostname}</Text>
                    <Text fontSize="xs" color="var(--muted-text)">{pc.os} ({pc.arch})</Text>
                  </Box>
                </HStack>
                <Badge colorPalette={pc.status === 'online' ? 'green' : 'red'} variant="subtle">
                  {pc.status}
                </Badge>
              </HStack>

              <VStack gap={3} align="stretch">
                <Box>
                  <HStack justify="space-between" mb={1}>
                    <HStack gap={1}>
                      <Cpu size={12} color="var(--muted-text)" />
                      <Text fontSize="xs" color="var(--muted-text)">CPU ({pc.cpu_count} cores)</Text>
                    </HStack>
                    <Text fontSize="xs" fontWeight="semibold">{pc.cpu_pct}%</Text>
                  </HStack>
                  <UsageBar pct={pc.cpu_pct} color="auto" />
                </Box>

                <Box>
                  <HStack justify="space-between" mb={1}>
                    <HStack gap={1}>
                      <MemoryStick size={12} color="var(--muted-text)" />
                      <Text fontSize="xs" color="var(--muted-text)">RAM</Text>
                    </HStack>
                    <Text fontSize="xs" fontWeight="semibold">{formatBytes(pc.ram_used)} / {formatBytes(pc.ram_total)}</Text>
                  </HStack>
                  <UsageBar pct={pc.ram_pct} color="auto" />
                </Box>

                <Box>
                  <HStack justify="space-between" mb={1}>
                    <HStack gap={1}>
                      <HardDrive size={12} color="var(--muted-text)" />
                      <Text fontSize="xs" color="var(--muted-text)">Disk</Text>
                    </HStack>
                    <Text fontSize="xs" fontWeight="semibold">{formatBytes(pc.disk_used)} / {formatBytes(pc.disk_total)}</Text>
                  </HStack>
                  <UsageBar pct={pc.disk_pct} color="auto" />
                </Box>

                <HStack justify="space-between" pt={2} borderTop="1px solid" borderColor="var(--border-color)">
                  <HStack gap={1}>
                    <Clock size={12} color="var(--muted-text)" />
                    <Text fontSize="xs" color="var(--muted-text)">Uptime: {formatUptime(pc.uptime_sec)}</Text>
                  </HStack>

                  <HStack gap={1}>
                    <Box
                      as="button"
                      p={1.5}
                      borderRadius="md"
                      bg="var(--surface-muted)"
                      _hover={{ bg: 'orange.100', _dark: { bg: 'orange.900' } }}
                      title="Restart"
                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleAction(pc.id, 'restart'); }}
                      opacity={actionLoading === `${pc.id}-restart` ? 0.5 : 1}
                    >
                      <RotateCcw size={14} color="var(--icon-color)" />
                    </Box>
                    <Box
                      as="button"
                      p={1.5}
                      borderRadius="md"
                      bg="var(--surface-muted)"
                      _hover={{ bg: 'red.100', _dark: { bg: 'red.900' } }}
                      title="Shutdown"
                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleAction(pc.id, 'shutdown'); }}
                      opacity={actionLoading === `${pc.id}-shutdown` ? 0.5 : 1}
                    >
                      <Power size={14} color="var(--muted-text)" />
                    </Box>
                  </HStack>
                </HStack>
              </VStack>
            </Box>
          ))}
        </Grid>
      )}
    </VStack>
  );
};

export default ComputersOverview;
