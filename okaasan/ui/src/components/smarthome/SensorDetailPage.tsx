import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Flex, Heading, Text, VStack, HStack, Spinner, Badge, Button, Input,
  DialogRoot, DialogContent, DialogHeader, DialogBody, DialogCloseTrigger,
  DialogBackdrop, DialogPositioner,
} from '@chakra-ui/react';
import {
  ArrowLeft, Activity, Thermometer, Droplets, Battery, Lightbulb,
  Zap, Wifi, Settings, RefreshCw, X,
} from 'lucide-react';
import embed from 'vega-embed';
import { recipeAPI } from '../../services/api';

interface ReportingInfo {
  min_interval: number;
  max_interval: number;
  reportable_change: number;
}

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
  reporting: Record<string, ReportingInfo>;
}

interface SensorReading {
  id: number;
  device_name: string;
  metric: string;
  value: number;
  recorded_at: string;
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
  soil_moisture: <Droplets size={14} />,
  battery: <Battery size={14} />,
  brightness: <Lightbulb size={14} />,
  power: <Zap size={14} />,
  energy: <Zap size={14} />,
  linkquality: <Wifi size={14} />,
};

function formatMetricName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function downsample<T>(data: T[], maxPoints: number): T[] {
  if (data.length <= maxPoints) return data;
  const step = data.length / maxPoints;
  const result: T[] = [data[0]];
  for (let i = 1; i < maxPoints - 1; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < data.length; j++) {
      sum += (data[j] as any).value;
      count++;
    }
    const mid = Math.floor((start + end) / 2);
    result.push({ ...(data[mid] as any), value: sum / count } as T);
  }
  result.push(data[data.length - 1]);
  return result;
}

const SensorDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [device, setDevice] = useState<ZigbeeDevice | null>(null);
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [configs, setConfigs] = useState<SensorConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);
  const [configOpen, setConfigOpen] = useState(false);

  const deviceNameRef = useRef<string>('');

  const fetchDevice = useCallback(async () => {
    try {
      const data = await recipeAPI.request<{ devices: ZigbeeDevice[] }>('/smarthome/devices');
      const dev = data.devices.find(d => d.ieee_address === id);
      setDevice(dev || null);
      if (dev) deviceNameRef.current = dev.friendly_name;
      return dev;
    } catch { return null; }
  }, [id]);

  const fetchHistory = useCallback(async () => {
    const name = deviceNameRef.current;
    if (!name) return;
    try {
      const data = await recipeAPI.request<{ readings: SensorReading[] }>(
        `/smarthome/sensors/history?device=${encodeURIComponent(name)}&hours=${hours}&limit=10000`
      );
      setReadings(data.readings);
    } catch { /* ignore */ }
  }, [hours]);

  const fetchConfigs = useCallback(async () => {
    try {
      const data = await recipeAPI.request<{ configs: SensorConfigEntry[] }>('/smarthome/sensors/config');
      setConfigs(data.configs);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const init = async () => {
      await fetchDevice();
      await fetchHistory();
      await fetchConfigs();
      setLoading(false);
    };
    init();
  }, [fetchDevice, fetchHistory, fetchConfigs]);

  const refresh = async () => {
    await fetchDevice();
    await fetchHistory();
  };

  useEffect(() => {
    const interval = setInterval(() => {
      fetchDevice();
      fetchHistory();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchDevice, fetchHistory]);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="300px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (!device) {
    return (
      <Box p={4}>
        <Button variant="ghost" onClick={() => navigate('/sensors')} mb={4}>
          <ArrowLeft size={16} /> Back to Sensors
        </Button>
        <Text color="var(--muted-text)">Sensor not found (ieee: {id})</Text>
      </Box>
    );
  }

  const deviceConfigs = configs.filter(c => c.device_name === device.friendly_name);

  // Only chart metrics that are enabled for recording
  const recordedMetrics = Object.entries(device.metrics || {}).filter(([metric]) => {
    const cfg = deviceConfigs.find(c => c.metric === metric);
    return cfg ? cfg.enabled : true;
  });

  return (
    <VStack gap={4} align="stretch" p={4}>
      <HStack justify="space-between">
        <HStack gap={2}>
          <Button variant="ghost" size="sm" onClick={() => navigate('/sensors')}>
            <ArrowLeft size={16} />
          </Button>
          <Heading size="lg" color="var(--heading-color)">{device.friendly_name}</Heading>
        </HStack>
        <HStack gap={2}>
          <Button size="xs" variant="ghost" onClick={refresh} title="Refresh">
            <RefreshCw size={14} />
          </Button>
          <Button size="xs" variant="outline" onClick={() => setConfigOpen(true)}>
            <Settings size={14} />
            Config
          </Button>
        </HStack>
      </HStack>

      {/* Device info */}
      <HStack gap={4} flexWrap="wrap">
        <Badge>{device.type}</Badge>
        <Text fontSize="xs" color="var(--muted-text)">{device.description || device.model}</Text>
        <Text fontSize="xs" color="var(--muted-text)">{device.vendor}</Text>
        {device.power_source && (
          <Badge variant="subtle">{device.power_source === 'Battery' ? '🔋' : '⚡'} {device.power_source}</Badge>
        )}
      </HStack>

      {/* Current values */}
      <Box p={4} bg="var(--card-bg)" borderRadius="lg" borderWidth="1px" borderColor="var(--border-color)">
        <Text fontWeight="medium" fontSize="sm" mb={2}>Current Values</Text>
        <HStack gap={4} flexWrap="wrap">
          {Object.entries(device.metrics || {}).map(([metric, unit]) => {
            const value = device.state[metric];
            const hasValue = typeof value === 'number';
            return (
              <HStack key={metric} gap={1} px={3} py={1} borderRadius="md" bg="var(--surface-muted)">
                {METRIC_ICON_MAP[metric] || <Activity size={14} />}
                <Text fontSize="sm" fontWeight="medium">
                  {formatMetricName(metric)}:
                </Text>
                <Text fontSize="sm" fontWeight="bold" color={hasValue ? undefined : 'var(--muted-text)'}>
                  {hasValue ? `${value}${unit}` : '—'}
                </Text>
              </HStack>
            );
          })}
        </HStack>
      </Box>

      {/* Time range selector */}
      <HStack gap={2}>
        <Text fontSize="sm" fontWeight="medium">History:</Text>
        {[1, 6, 12, 24, 48, 168].map(h => (
          <Button
            key={h}
            size="xs"
            variant={hours === h ? 'solid' : 'outline'}
            colorPalette={hours === h ? 'blue' : 'gray'}
            onClick={() => setHours(h)}
          >
            {h < 24 ? `${h}h` : `${h / 24}d`}
          </Button>
        ))}
      </HStack>

      {/* Charts — only for enabled/recorded metrics */}
      {recordedMetrics.map(([metric, unit]) => {
        const metricReadings = readings.filter(r => r.metric === metric);
        if (metricReadings.length === 0) return null;
        return (
          <MetricChart
            key={metric}
            metric={metric}
            unit={unit}
            readings={metricReadings}
          />
        );
      })}

      {readings.length === 0 && (
        <Box p={4} bg="var(--card-bg)" borderRadius="lg" borderWidth="1px" borderColor="var(--border-color)" textAlign="center">
          <Text fontSize="sm" color="var(--muted-text)">
            No recorded data yet. The sensor will start recording once it reports values.
          </Text>
        </Box>
      )}

      {/* Config modal */}
      <DialogRoot open={configOpen} onOpenChange={(e) => setConfigOpen(e.open)} placement="center">
        <DialogBackdrop />
        <DialogPositioner>
          <DialogContent maxW="500px">
            <DialogHeader>
              <HStack gap={2}>
                <Settings size={18} />
                <Heading size="md">Recording Configuration</Heading>
              </HStack>
            </DialogHeader>
            <DialogCloseTrigger />
            <DialogBody pb={6}>
              <Text fontSize="xs" color="var(--muted-text)" mb={4}>
                Set how often each metric is recorded (in seconds). Disable metrics you don't want to track.
              </Text>
            <VStack align="stretch" gap={2}>
              {Object.entries(device.metrics || {}).map(([metric, unit]) => {
                const cfg = deviceConfigs.find(c => c.metric === metric);
                const reporting = device.reporting?.[metric];
                return (
                  <ConfigRow
                    key={metric}
                    deviceName={device.friendly_name}
                    metric={metric}
                    unit={unit}
                    interval={cfg?.interval_seconds ?? 60}
                    enabled={cfg?.enabled ?? true}
                    reporting={reporting}
                    onUpdate={fetchConfigs}
                  />
                );
              })}
            </VStack>
            </DialogBody>
          </DialogContent>
        </DialogPositioner>
      </DialogRoot>
    </VStack>
  );
};

const MetricChart: React.FC<{
  metric: string;
  unit: string;
  readings: SensorReading[];
}> = ({ metric, unit, readings }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);

  useEffect(() => {
    if (!chartRef.current || readings.length === 0) return;

    const values = downsample(readings.map(r => ({
      time: r.recorded_at,
      value: r.value,
    })), 1000);

    const spec: any = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container',
      height: 160,
      padding: { left: 5, right: 5, top: 5, bottom: 5 },
      data: { values },
      mark: { type: 'line', interpolate: 'monotone', strokeWidth: 1.5 },
      encoding: {
        x: {
          field: 'time',
          type: 'temporal',
          axis: { format: '%H:%M', labelFontSize: 10, title: null, labelOverlap: 'parity', tickCount: 15 },
        },
        y: {
          field: 'value',
          type: 'quantitative',
          scale: { zero: false },
          axis: { title: `${formatMetricName(metric)} (${unit})`, labelFontSize: 10, titleFontSize: 11, titlePadding: 16 },
        },
      },
      config: {
        background: 'transparent',
        axis: { gridColor: '#333', domainColor: '#555', tickColor: '#555', labelColor: '#aaa', titleColor: '#ccc' },
        view: { stroke: 'transparent' },
      },
    };

    if (viewRef.current) {
      viewRef.current.finalize();
      viewRef.current = null;
    }

    embed(chartRef.current, spec, {
      actions: false,
      renderer: 'svg',
    }).then((result: any) => {
      viewRef.current = result.view;
    }).catch(() => {});

    return () => {
      if (viewRef.current) {
        viewRef.current.finalize();
        viewRef.current = null;
      }
    };
  }, [readings, metric, unit]);

  return (
    <Box p={4} bg="var(--card-bg)" borderRadius="lg" borderWidth="1px" borderColor="var(--border-color)">
      <HStack gap={2} mb={2}>
        {METRIC_ICON_MAP[metric] || <Activity size={14} />}
        <Text fontSize="sm" fontWeight="medium">{formatMetricName(metric)}</Text>
        <Badge fontSize="2xs">{readings.length} points</Badge>
      </HStack>
      <Box ref={chartRef} w="100%" />
    </Box>
  );
};

const ConfigRow: React.FC<{
  deviceName: string;
  metric: string;
  unit: string;
  interval: number;
  enabled: boolean;
  reporting?: ReportingInfo;
  onUpdate: () => void;
}> = ({ deviceName, metric, unit, interval, enabled, reporting, onUpdate }) => {
  const [localInterval, setLocalInterval] = useState(String(interval));
  const [localEnabled, setLocalEnabled] = useState(enabled);
  const [saving, setSaving] = useState(false);

  const dirty = Number(localInterval) !== interval || localEnabled !== enabled;
  const minInterval = reporting?.min_interval ?? 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      await recipeAPI.request('/smarthome/sensors/config', {
        method: 'PUT',
        body: JSON.stringify({
          device_name: deviceName,
          metric,
          interval_seconds: Number(localInterval) || 60,
          enabled: localEnabled,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      onUpdate();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <Box px={3} py={2} borderRadius="md" bg="var(--surface-muted)">
      <HStack gap={2} mb={reporting ? 1 : 0}>
        <HStack gap={1} flex={1}>
          {METRIC_ICON_MAP[metric] || <Activity size={12} />}
          <Text fontSize="xs" fontWeight="medium">{formatMetricName(metric)}</Text>
          <Text fontSize="2xs" color="var(--muted-text)">({unit})</Text>
        </HStack>
        <HStack gap={2}>
          <Input
            size="xs"
            w="65px"
            type="number"
            min={minInterval || 5}
            value={localInterval}
            onChange={e => setLocalInterval(e.target.value)}
          />
          <Text fontSize="2xs" color="var(--muted-text)">sec</Text>
          <Button
            size="xs"
            variant={localEnabled ? 'solid' : 'outline'}
            colorPalette={localEnabled ? 'green' : 'gray'}
            onClick={() => setLocalEnabled(!localEnabled)}
          >
            {localEnabled ? 'On' : 'Off'}
          </Button>
          <Button size="xs" colorPalette="blue" onClick={handleSave} disabled={!dirty || saving}>
            Save
          </Button>
        </HStack>
      </HStack>
      {reporting && (
        <Text fontSize="2xs" color="var(--muted-text)">
          Sensor reports every {reporting.min_interval}s–{reporting.max_interval}s
          {reporting.min_interval > 0 && ` (fastest: ${reporting.min_interval}s)`}
        </Text>
      )}
    </Box>
  );
};

export default SensorDetailPage;
