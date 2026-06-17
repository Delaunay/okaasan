import { useEffect, useState, useCallback } from 'react';
import {
  Box, Flex, Heading, Text, VStack, HStack, Spinner, Badge, Button,
} from '@chakra-ui/react';
import {
  Home, Wifi, CheckCircle2, Circle, AlertCircle,
  Terminal, Copy, Check, ChevronRight, RefreshCw,
} from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface SetupStatus {
  setup_complete: boolean;
  conbee: { name: string; path: string; resolved: string } | null;
  user_in_dialout: boolean;
  mosquitto: { installed: boolean; running: boolean };
  zigbee2mqtt: { installed: boolean; configured: boolean; running: boolean };
}

const SmartHomePage: React.FC = () => {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await recipeAPI.request<SetupStatus>('/smarthome/status');
      setStatus(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to check setup status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="300px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (error) {
    return (
      <Box p={4}>
        <Box p={4} bg="var(--panel-red-bg)" borderRadius="md" borderWidth="1px" borderColor="var(--panel-red-border)">
          <Text color="var(--panel-red-text)">{error}</Text>
        </Box>
      </Box>
    );
  }

  if (status?.setup_complete) {
    return (
      <VStack gap={6} align="stretch" p={4}>
        <HStack justify="space-between">
          <HStack>
            <Home size={24} />
            <Heading size="lg" color="var(--heading-color)">Smart Home</Heading>
            <Badge colorPalette="green">Connected</Badge>
          </HStack>
          <HStack gap={2}>
            <Button size="xs" variant="ghost" onClick={fetchStatus} title="Refresh status">
              <RefreshCw size={14} />
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => window.open('http://192.168.2.157:8085', '_blank')}
            >
              Z2M Dashboard
            </Button>
          </HStack>
        </HStack>

        <Box p={4} bg="var(--card-bg)" borderRadius="lg" borderWidth="1px" borderColor="var(--border-color)">
          <VStack align="stretch" gap={2}>
            <HStack gap={2}>
              <Wifi size={16} color="green" />
              <Text fontSize="sm" fontWeight="medium">Zigbee2MQTT is running</Text>
            </HStack>
            <Text fontSize="xs" color="var(--muted-text)">
              Devices are managed through the Sensors and Switches pages in this section.
            </Text>
          </VStack>
        </Box>
      </VStack>
    );
  }

  return (
    <VStack gap={6} align="stretch" p={4}>
      <HStack>
        <Home size={24} />
        <Heading size="lg" color="var(--heading-color)">Smart Home</Heading>
      </HStack>
      <SetupTutorial status={status!} onRefresh={fetchStatus} />
    </VStack>
  );
};

// ── Setup Tutorial Components ────────────────────────────────────────────

const StepStatus: React.FC<{ done: boolean; label: string }> = ({ done, label }) => (
  <HStack gap={2}>
    {done ? <CheckCircle2 size={16} color="green" /> : <Circle size={16} />}
    <Text fontSize="sm" color={done ? undefined : 'var(--muted-text)'}>{label}</Text>
  </HStack>
);

const CopyBlock: React.FC<{ code: string }> = ({ code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box position="relative" bg="var(--surface-muted)" borderRadius="md" p={3} fontFamily="mono" fontSize="xs" overflowX="auto">
      <Button
        size="xs"
        variant="ghost"
        position="absolute"
        top={1}
        right={1}
        onClick={handleCopy}
        title="Copy"
      >
        {copied ? <Check size={12} color="green" /> : <Copy size={12} />}
      </Button>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{code}</pre>
    </Box>
  );
};

const SetupTutorial: React.FC<{ status: SetupStatus; onRefresh: () => void }> = ({ status, onRefresh }) => {
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const conbeeDetected = status.conbee !== null;
  const steps = [
    { id: 1, label: 'ConBee III detected', done: conbeeDetected },
    { id: 2, label: 'User has serial port access', done: status.user_in_dialout },
    { id: 3, label: 'Mosquitto MQTT broker installed', done: status.mosquitto.installed },
    { id: 4, label: 'Mosquitto running', done: status.mosquitto.running },
    { id: 5, label: 'Zigbee2MQTT installed', done: status.zigbee2mqtt.installed },
    { id: 6, label: 'Zigbee2MQTT configured', done: status.zigbee2mqtt.configured },
    { id: 7, label: 'Zigbee2MQTT running', done: status.zigbee2mqtt.running },
  ];

  const firstIncomplete = steps.find(s => !s.done)?.id ?? null;

  useEffect(() => {
    if (activeStep === null && firstIncomplete !== null) {
      setActiveStep(firstIncomplete);
    }
  }, [firstIncomplete, activeStep]);

  const serialPath = status.conbee?.path || '/dev/serial/by-id/usb-dresden_elektronik_ConBee_III_XXXXX-if00-port0';

  return (
    <Box>
      <Box p={4} bg="var(--panel-blue-bg)" borderRadius="lg" borderWidth="1px" borderColor="var(--panel-blue-border)" mb={4}>
        <HStack gap={2} mb={2}>
          <AlertCircle size={16} />
          <Text fontWeight="medium" color="var(--panel-blue-text)">Zigbee Setup Required</Text>
        </HStack>
        <Text fontSize="sm" color="var(--panel-blue-text)">
          Your ConBee III {conbeeDetected ? 'has been detected' : 'was not detected'}. Follow the steps below to set up Zigbee2MQTT
          so you can control smart home devices.
        </Text>
      </Box>

      {/* Progress overview */}
      <Box p={4} bg="var(--card-bg)" borderRadius="lg" borderWidth="1px" borderColor="var(--border-color)" mb={4}>
        <HStack justify="space-between" mb={3}>
          <Text fontWeight="medium">Setup Progress</Text>
          <Button size="xs" variant="outline" onClick={onRefresh}>
            Refresh
          </Button>
        </HStack>
        <VStack align="stretch" gap={2}>
          {steps.map(s => (
            <Box
              key={s.id}
              cursor="pointer"
              onClick={() => setActiveStep(s.id)}
              px={3}
              py={2}
              borderRadius="md"
              bg={activeStep === s.id ? 'var(--selected-bg)' : undefined}
              _hover={{ bg: 'var(--hover-bg)' }}
            >
              <HStack justify="space-between">
                <StepStatus done={s.done} label={s.label} />
                <ChevronRight size={14} style={{ opacity: 0.5 }} />
              </HStack>
            </Box>
          ))}
        </VStack>
      </Box>

      {/* Step detail */}
      {activeStep === 1 && (
        <StepCard title="1. Connect ConBee III" done={conbeeDetected}>
          {conbeeDetected ? (
            <VStack align="stretch" gap={2}>
              <Text fontSize="sm">ConBee III detected:</Text>
              <CopyBlock code={status.conbee!.path} />
              <Text fontSize="xs" color="var(--muted-text)">Resolves to: {status.conbee!.resolved}</Text>
            </VStack>
          ) : (
            <Text fontSize="sm" color="var(--muted-text)">
              Plug the ConBee III USB stick into the server. It should appear as a serial device automatically.
            </Text>
          )}
        </StepCard>
      )}

      {activeStep === 2 && (
        <StepCard title="2. Serial Port Access" done={status.user_in_dialout}>
          <Text fontSize="sm" mb={2}>Add your user to the <code>dialout</code> group for serial port access:</Text>
          <CopyBlock code={`sudo usermod -aG dialout $USER`} />
          <Text fontSize="xs" color="var(--muted-text)" mt={2}>Reboot after running this command.</Text>
        </StepCard>
      )}

      {activeStep === 3 && (
        <StepCard title="3. Install Mosquitto" done={status.mosquitto.installed}>
          <Text fontSize="sm" mb={2}>Install the MQTT broker:</Text>
          <CopyBlock code={`sudo apt-get update && sudo apt-get install -y mosquitto mosquitto-clients`} />
        </StepCard>
      )}

      {activeStep === 4 && (
        <StepCard title="4. Start Mosquitto" done={status.mosquitto.running}>
          <Text fontSize="sm" mb={2}>Enable and start the service:</Text>
          <CopyBlock code={`sudo systemctl enable mosquitto\nsudo systemctl start mosquitto`} />
        </StepCard>
      )}

      {activeStep === 5 && (
        <StepCard title="5. Install Zigbee2MQTT" done={status.zigbee2mqtt.installed}>
          <Text fontSize="sm" mb={2}>Clone and install Zigbee2MQTT:</Text>
          <CopyBlock code={`sudo mkdir -p /opt/zigbee2mqtt\nsudo chown $USER:$USER /opt/zigbee2mqtt\ngit clone --depth 1 https://github.com/Koenkk/zigbee2mqtt.git /opt/zigbee2mqtt\ncd /opt/zigbee2mqtt\nnpm ci`} />
          <Text fontSize="xs" color="var(--muted-text)" mt={2}>This may take a few minutes.</Text>
        </StepCard>
      )}

      {activeStep === 6 && (
        <StepCard title="6. Configure Zigbee2MQTT" done={status.zigbee2mqtt.configured}>
          <Text fontSize="sm" mb={2}>Create the configuration file:</Text>
          <CopyBlock code={`mkdir -p /opt/zigbee2mqtt/data`} />
          <Text fontSize="sm" mt={3} mb={2}>Write to <code>/opt/zigbee2mqtt/data/configuration.yaml</code>:</Text>
          <CopyBlock code={`mqtt:
  base_topic: zigbee2mqtt
  server: mqtt://localhost:1883

serial:
  port: ${serialPath}
  baudrate: 115200
  adapter: deconz

advanced:
  log_level: info
  network_key: GENERATE
  pan_id: GENERATE
  ext_pan_id: GENERATE

frontend:
  enabled: true
  port: 8085

homeassistant:
  enabled: false`} />
        </StepCard>
      )}

      {activeStep === 7 && (
        <StepCard title="7. Create Systemd Service & Start" done={status.zigbee2mqtt.running}>
          <Text fontSize="sm" mb={2}>Create <code>/etc/systemd/system/zigbee2mqtt.service</code>:</Text>
          <CopyBlock code={`[Unit]
Description=Zigbee2MQTT
After=network.target mosquitto.service

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/zigbee2mqtt
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target`} />
          <Text fontSize="sm" mt={3} mb={2}>Then enable and start:</Text>
          <CopyBlock code={`sudo systemctl daemon-reload\nsudo systemctl enable zigbee2mqtt\nsudo systemctl start zigbee2mqtt`} />
        </StepCard>
      )}
    </Box>
  );
};

const StepCard: React.FC<{ title: string; done: boolean; children: React.ReactNode }> = ({ title, done, children }) => (
  <Box
    p={4}
    bg="var(--card-bg)"
    borderRadius="lg"
    borderWidth="1px"
    borderColor={done ? 'green.500' : 'var(--border-color)'}
  >
    <HStack mb={3} gap={2}>
      <Terminal size={16} />
      <Text fontWeight="medium">{title}</Text>
      {done && <Badge colorPalette="green" fontSize="xs">Done</Badge>}
    </HStack>
    {children}
  </Box>
);

export default SmartHomePage;
