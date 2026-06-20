import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Flex, Heading, Text, VStack, HStack, Spinner, Badge, SimpleGrid,
} from '@chakra-ui/react';
import {
  Activity, Thermometer, Droplets, Battery, Lightbulb, Zap, Wifi, Radio, Sprout,
} from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface ZigbeeDevice {
  ieee_address: string;
  friendly_name: string;
  type: string;
  vendor: string;
  model: string;
  description: string;
  power_source: string;
  supported: boolean;
  state: Record<string, any>;
  metrics: Record<string, string>;
  availability: 'online' | 'offline' | 'unknown';
}

interface SensorConfigEntry {
  id: number;
  device_name: string;
  metric: string;
  interval_seconds: number;
  enabled: boolean;
}

const METRIC_ICON_MAP: Record<string, React.ReactNode> = {
  temperature: <Thermometer size={14} />,
  humidity: <Droplets size={14} />,
  soil_moisture: <Sprout size={14} />,
  battery: <Battery size={14} />,
  brightness: <Lightbulb size={14} />,
  power: <Zap size={14} />,
  energy: <Zap size={14} />,
  linkquality: <Wifi size={14} />,
};

function formatMetricName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const SensorsPage: React.FC = () => {
  const [devices, setDevices] = useState<ZigbeeDevice[]>([]);
  const [configs, setConfigs] = useState<SensorConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    try {
      const [devData, cfgData] = await Promise.all([
        recipeAPI.request<{ devices: ZigbeeDevice[]; mqtt_connected: boolean }>('/smarthome/devices'),
        recipeAPI.request<{ configs: SensorConfigEntry[] }>('/smarthome/sensors/config'),
      ]);
      setDevices(devData.devices);
      setConfigs(cfgData.configs);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="300px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  // Only show devices that have numeric metrics
  const sensorDevices = devices.filter(d => Object.keys(d.metrics || {}).length > 0);

  return (
    <VStack gap={4} align="stretch" p={4}>
      <HStack>
        <Activity size={22} />
        <Heading size="lg" color="var(--heading-color)">Sensors</Heading>
        <Badge fontSize="xs">{sensorDevices.length}</Badge>
      </HStack>

      {sensorDevices.length === 0 ? (
        <Box p={6} bg="var(--card-bg)" borderRadius="lg" borderWidth="1px" borderColor="var(--border-color)" textAlign="center">
          <Radio size={28} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
          <Text fontSize="sm" color="var(--muted-text)">
            No sensor devices found. Pair Zigbee sensors via the Smart Home page.
          </Text>
        </Box>
      ) : (
        <SimpleGrid columns={{ base: 3, sm: 4, md: 5, lg: 7, xl: 9 }} gap={2}>
          {sensorDevices.map(dev => (
            <SensorTile
              key={dev.ieee_address}
              device={dev}
              configs={configs}
              onClick={() => navigate(`/sensors/${dev.ieee_address}`)}
            />
          ))}
        </SimpleGrid>
      )}
    </VStack>
  );
};

const DIAGNOSTIC_METRICS = new Set(['battery', 'linkquality', 'voltage']);

const SensorTile: React.FC<{
  device: ZigbeeDevice;
  configs: SensorConfigEntry[];
  onClick: () => void;
}> = ({ device, configs, onClick }) => {
  const { state, friendly_name, metrics, power_source, availability } = device;

  const enabledMetrics = Object.entries(metrics || {}).filter(([metricName]) => {
    if (DIAGNOSTIC_METRICS.has(metricName)) return false;
    const cfg = configs.find(c => c.device_name === friendly_name && c.metric === metricName);
    return cfg ? cfg.enabled : true;
  });

  const badgeColor = availability === 'online' ? 'green' : availability === 'offline' ? 'red' : 'gray';
  const badgeLabel = availability === 'online' ? 'Online' : availability === 'offline' ? 'Offline' : 'Unknown';

  return (
    <Box
      p={2}
      bg="var(--card-bg)"
      borderRadius="md"
      borderWidth="1px"
      borderColor="var(--border-color)"
      cursor="pointer"
      onClick={onClick}
      _hover={{ borderColor: 'var(--icon-color)', transform: 'translateY(-1px)' }}
      transition="all 0.15s"
    >
      <Text fontSize="s" fontWeight="semibold" lineClamp={1} mb={1}>
        {friendly_name}
      </Text>

      <VStack align="stretch" gap={0}>
        {enabledMetrics.map(([metricName, unit]) => {
          const value = state[metricName];
          const hasValue = typeof value === 'number';
          return (
            <HStack key={metricName} gap={1} justify="space-between">
              {METRIC_ICON_MAP[metricName] || <Activity size={11} />}
              <Text fontSize="xs" fontWeight="medium" color={hasValue ? undefined : 'var(--muted-text)'}>
                {hasValue ? `${value}${unit}` : '—'}
              </Text>
            </HStack>
          );
        })}
      </VStack>

      <HStack justify="space-between" mt={1}>
        <Badge fontSize="2xs" colorPalette={badgeColor}>
          {badgeLabel}
        </Badge>
        {power_source === 'Battery' && typeof state.battery === 'number' && (
          <Text fontSize="xs" color="var(--muted-text)">🔋{state.battery}%</Text>
        )}
      </HStack>
    </Box>
  );
};

export default SensorsPage;
