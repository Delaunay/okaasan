import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Button, Flex, Heading, HStack, Text, VStack, Badge,
} from '@chakra-ui/react';
import { useColorModeValue } from './ui/color-mode';
import { useToast } from './ui/toaster';
import {
  CalendarDays, Upload, Copy, Check, ExternalLink,
  Loader2, Shield, RefreshCw, ChevronDown, AlertTriangle, X,
} from 'lucide-react';
import { recipeAPI } from '../services/api';

interface GCalStatus {
  key_uploaded: boolean;
  client_email: string;
  calendar_id: string;
  setup_complete: boolean;
}

interface GCalCalendar {
  id: string;
  summary: string;
  description: string;
  primary: boolean;
}

interface TestResult {
  connected: boolean;
  calendars?: number;
  events_this_week?: number;
  sample_events?: any[];
  error?: string;
}

function ErrorPanel({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isMultiline = error.includes('\n');
  const shortMessage = error.split('\n').filter(l => l.trim()).pop() || error;

  return (
    <Box my={3} p={3} borderRadius="md" bg="red.900" color="white" fontSize="sm">
      <Flex justify="space-between" align="flex-start" gap={2}>
        <Flex align="flex-start" gap={2} flex={1} minW={0}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <Box flex={1} minW={0}>
            <Text fontWeight="bold" wordBreak="break-word">{shortMessage}</Text>
            {isMultiline && (
              <Button
                size="xs" variant="ghost" color="red.200"
                onClick={() => setExpanded(!expanded)}
                mt={1} p={0} h="auto"
                _hover={{ color: 'white' }}
              >
                {expanded ? 'Hide traceback' : 'Show full traceback'}
              </Button>
            )}
            {expanded && (
              <Box
                as="pre"
                mt={2} p={2}
                bg="blackAlpha.400"
                borderRadius="md"
                fontSize="xs"
                fontFamily="mono"
                whiteSpace="pre-wrap"
                wordBreak="break-word"
                overflowX="auto"
                maxH="400px"
                overflowY="auto"
              >
                {error}
              </Box>
            )}
          </Box>
        </Flex>
        <Button size="xs" variant="ghost" color="red.200" onClick={onDismiss}
          _hover={{ color: 'white' }} flexShrink={0} p={0} minW={0}>
          <X size={14} />
        </Button>
      </Flex>
    </Box>
  );
}

export default function GoogleCalendarSettings() {
  const [status, setStatus] = useState<GCalStatus | null>(null);
  const [loading, setLoading] = useState('');
  const [calendars, setCalendars] = useState<GCalCalendar[]>([]);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const cardBg = useColorModeValue('#f8f9fa', '#16213e');
  const border = useColorModeValue('#e2e8f0', '#2d3748');
  const mutedText = useColorModeValue('#718096', '#a0aec0');
  const selectBg = useColorModeValue('white', '#1a1a2e');
  const keyBg = useColorModeValue('#edf2f7', '#0f3460');
  const selectedBg = useColorModeValue('blue.50', 'blue.900');
  const hoverBg = useColorModeValue('gray.50', 'gray.800');

  const fetchStatus = useCallback(async () => {
    try {
      const data = await recipeAPI.getGCalStatus();
      setStatus(data);
    } catch (e: any) {
      setLastError(e.message || 'Failed to fetch Google Calendar status');
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading('upload');
    setLastError(null);
    try {
      const text = await file.text();
      let keyData: object;
      try {
        keyData = JSON.parse(text);
      } catch {
        setLastError('File is not valid JSON');
        return;
      }

      const result = await recipeAPI.uploadGCalKey(keyData);
      toast('success', `Key uploaded — service account: ${result.client_email}`);
      await fetchStatus();
    } catch (e: any) {
      setLastError(e.message || 'Upload failed');
    } finally {
      setLoading('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const copyEmail = () => {
    if (status?.client_email) {
      navigator.clipboard.writeText(status.client_email);
      toast('success', 'Service account email copied');
    }
  };

  const fetchCalendars = async () => {
    setLoading('calendars');
    setLastError(null);
    try {
      const data = await recipeAPI.getGCalCalendars();
      setCalendars(data);
      setCalendarOpen(true);
    } catch (e: any) {
      setLastError(e.message || 'Failed to fetch calendars');
    } finally {
      setLoading('');
    }
  };

  const selectCalendar = async (calId: string) => {
    setLoading('select');
    setLastError(null);
    try {
      await recipeAPI.selectGCalCalendar(calId);
      toast('success', 'Calendar selected');
      setCalendarOpen(false);
      await fetchStatus();
    } catch (e: any) {
      setLastError(e.message || 'Failed to select calendar');
    } finally {
      setLoading('');
    }
  };

  const testConnection = async () => {
    setLoading('test');
    setLastError(null);
    setTestResult(null);
    try {
      const data = await recipeAPI.testGCal();
      setTestResult(data);
      if (data.connected) {
        toast('success', `Connected — ${data.events_this_week} events this week`);
      } else {
        setLastError(data.error || 'Connection failed');
      }
    } catch (e: any) {
      setTestResult({ connected: false, error: e.message });
      setLastError(e.message || 'Connection test failed');
    } finally {
      setLoading('');
    }
  };

  if (!status) {
    return (
      <Box p={6} maxW="800px" mx="auto">
        {lastError ? (
          <ErrorPanel error={lastError} onDismiss={() => setLastError(null)} />
        ) : (
          <Flex align="center" gap={2}><Loader2 className="spin" size={18} /> Loading...</Flex>
        )}
      </Box>
    );
  }

  return (
    <Box p={6} maxW="800px" mx="auto">
      <Heading size="lg" mb={6}>
        <Flex align="center" gap={2}>
          <CalendarDays size={24} />
          Google Calendar
          {status.setup_complete && (
            <Badge colorPalette="green" variant="subtle" ml={2}>Connected</Badge>
          )}
        </Flex>
      </Heading>

      {/* Persistent error display */}
      {lastError && (
        <ErrorPanel error={lastError} onDismiss={() => setLastError(null)} />
      )}

      {/* Step 1: Enable Google Calendar API */}
      <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border} mb={4}>
        <Heading size="md" mb={3}>
          <Flex align="center" gap={2}>
            <Box w={6} h={6} borderRadius="full" bg="blue.500" color="white"
              display="flex" alignItems="center" justifyContent="center"
              fontSize="xs" fontWeight="bold">1</Box>
            Enable the Google Calendar API
          </Flex>
        </Heading>
        <Text fontSize="sm" color={mutedText} mb={3}>
          Go to the Google Cloud Console and enable the Calendar API for your project.
          If you don't have a project yet, create one first.
        </Text>
        <HStack gap={2} flexWrap="wrap">
          <Button size="sm" variant="outline" asChild>
            <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} />
              <Box ml={1}>Create Project</Box>
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} />
              <Box ml={1}>Enable Calendar API</Box>
            </a>
          </Button>
        </HStack>
      </Box>

      {/* Step 2: Create Service Account */}
      <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border} mb={4}>
        <Heading size="md" mb={3}>
          <Flex align="center" gap={2}>
            <Box w={6} h={6} borderRadius="full" bg="blue.500" color="white"
              display="flex" alignItems="center" justifyContent="center"
              fontSize="xs" fontWeight="bold">2</Box>
            Create a Service Account
          </Flex>
        </Heading>
        <VStack align="stretch" gap={3}>
          <Text fontSize="sm" color={mutedText}>
            Create a service account in your Google Cloud project, then create and download
            a JSON key for it.
          </Text>
          <Box fontSize="sm" color={mutedText}>
            <Text fontWeight="medium" mb={1}>Quick steps:</Text>
            <Box as="ol" pl={5} listStyleType="decimal" lineHeight="tall">
              <li>Open the Service Accounts page (link below)</li>
              <li>Click <strong>Create Service Account</strong></li>
              <li>Give it a name (e.g. "okaasan-calendar") and click <strong>Done</strong></li>
              <li>Click the new account → <strong>Keys</strong> tab → <strong>Add Key</strong> → <strong>Create new key</strong> → <strong>JSON</strong></li>
              <li>Save the downloaded file — you'll upload it in the next step</li>
            </Box>
          </Box>
          <Button size="sm" variant="outline" asChild>
            <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} />
              <Box ml={1}>Service Accounts Page</Box>
            </a>
          </Button>
        </VStack>
      </Box>

      {/* Step 3: Upload Key */}
      <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border} mb={4}>
        <Heading size="md" mb={3}>
          <Flex align="center" gap={2}>
            <Box w={6} h={6} borderRadius="full" bg={status.key_uploaded ? "green.500" : "blue.500"} color="white"
              display="flex" alignItems="center" justifyContent="center"
              fontSize="xs" fontWeight="bold">
              {status.key_uploaded ? <Check size={14} /> : "3"}
            </Box>
            Upload Service Account Key
            {status.key_uploaded && <Check size={16} color="green" />}
          </Flex>
        </Heading>
        <Text fontSize="sm" color={mutedText} mb={3}>
          Upload the JSON key file you downloaded in the previous step.
        </Text>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />

        <HStack gap={2} flexWrap="wrap">
          <Button
            onClick={() => fileInputRef.current?.click()}
            colorPalette={status.key_uploaded ? undefined : "blue"}
            variant={status.key_uploaded ? "outline" : "solid"}
            size="sm"
            disabled={loading === 'upload'}
          >
            {loading === 'upload' ? <Loader2 className="spin" size={14} /> : <Upload size={14} />}
            <Box ml={1}>{status.key_uploaded ? 'Replace Key' : 'Upload JSON Key'}</Box>
          </Button>
        </HStack>

        {status.key_uploaded && status.client_email && (
          <Box mt={3} p={3} borderRadius="md" bg={keyBg} fontFamily="mono" fontSize="sm">
            <Flex justify="space-between" align="center">
              <Text wordBreak="break-all">{status.client_email}</Text>
              <Button size="xs" variant="ghost" onClick={copyEmail} ml={2} flexShrink={0}>
                <Copy size={14} />
              </Button>
            </Flex>
          </Box>
        )}
      </Box>

      {/* Step 4: Share Calendar */}
      {status.key_uploaded && (
        <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border} mb={4}>
          <Heading size="md" mb={3}>
            <Flex align="center" gap={2}>
              <Box w={6} h={6} borderRadius="full" bg="blue.500" color="white"
                display="flex" alignItems="center" justifyContent="center"
                fontSize="xs" fontWeight="bold">4</Box>
              Share Your Calendar
            </Flex>
          </Heading>
          <VStack align="stretch" gap={3}>
            <Text fontSize="sm" color={mutedText}>
              Share your Google Calendar with the service account so it can read your events.
            </Text>
            <Box fontSize="sm" color={mutedText}>
              <Text fontWeight="medium" mb={1}>Quick steps:</Text>
              <Box as="ol" pl={5} listStyleType="decimal" lineHeight="tall">
                <li>Open <strong>Google Calendar</strong> in your browser</li>
                <li>Find your calendar on the left, click the <strong>&#x22EE;</strong> menu → <strong>Settings and sharing</strong></li>
                <li>Under <strong>Share with specific people or groups</strong>, click <strong>Add people and groups</strong></li>
                <li>
                  Paste the service account email:
                  <Box as="span" fontFamily="mono" fontWeight="bold" mx={1}>{status.client_email}</Box>
                  <Button size="xs" variant="ghost" onClick={copyEmail} display="inline-flex" verticalAlign="middle">
                    <Copy size={12} />
                  </Button>
                </li>
                <li>Set permission to <strong>See all event details</strong> and click <strong>Send</strong></li>
              </Box>
            </Box>
            <Button size="sm" variant="outline" asChild>
              <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} />
                <Box ml={1}>Google Calendar Settings</Box>
              </a>
            </Button>
          </VStack>
        </Box>
      )}

      {/* Step 5: Select Calendar */}
      {status.key_uploaded && (
        <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border} mb={4}>
          <Heading size="md" mb={3}>
            <Flex align="center" gap={2}>
              <Box w={6} h={6} borderRadius="full" bg={status.calendar_id ? "green.500" : "blue.500"} color="white"
                display="flex" alignItems="center" justifyContent="center"
                fontSize="xs" fontWeight="bold">
                {status.calendar_id ? <Check size={14} /> : "5"}
              </Box>
              Select Calendar
              {status.calendar_id && <Check size={16} color="green" />}
            </Flex>
          </Heading>

          {status.calendar_id && (
            <Box mb={3} p={3} borderRadius="md" bg={keyBg} fontFamily="mono" fontSize="sm">
              <Text>Current: <strong>{status.calendar_id}</strong></Text>
            </Box>
          )}

          <Button
            size="sm"
            colorPalette={status.calendar_id ? undefined : "blue"}
            variant={status.calendar_id ? "outline" : "solid"}
            onClick={fetchCalendars}
            disabled={loading === 'calendars'}
          >
            {loading === 'calendars' ? <Loader2 className="spin" size={14} /> : <ChevronDown size={14} />}
            <Box ml={1}>{status.calendar_id ? 'Change Calendar' : 'Load Calendars'}</Box>
          </Button>

          {calendarOpen && calendars.length > 0 && (
            <VStack align="stretch" gap={1} mt={3}>
              {calendars.map((cal) => (
                <Box
                  key={cal.id}
                  p={3}
                  borderRadius="md"
                  border="1px solid"
                  borderColor={status.calendar_id === cal.id ? 'blue.400' : border}
                  bg={status.calendar_id === cal.id ? selectedBg : selectBg}
                  cursor="pointer"
                  transition="all 0.15s"
                  _hover={{ borderColor: 'blue.300', bg: hoverBg }}
                  onClick={() => selectCalendar(cal.id)}
                >
                  <Flex justify="space-between" align="center">
                    <Box>
                      <Text fontSize="sm" fontWeight="medium">
                        {cal.summary || cal.id}
                        {cal.primary && (
                          <Badge ml={2} colorPalette="blue" variant="subtle" size="sm">Primary</Badge>
                        )}
                      </Text>
                      {cal.description && (
                        <Text fontSize="xs" color={mutedText}>{cal.description}</Text>
                      )}
                      <Text fontSize="xs" fontFamily="mono" color={mutedText}>{cal.id}</Text>
                    </Box>
                    {status.calendar_id === cal.id && <Check size={16} color="green" />}
                  </Flex>
                </Box>
              ))}
            </VStack>
          )}

          {calendarOpen && calendars.length === 0 && loading !== 'calendars' && (
            <Box mt={3} p={3} borderRadius="md" bg="orange.900" color="white" fontSize="sm">
              No calendars found. Make sure you've shared your calendar with the service
              account email in Step 4.
            </Box>
          )}
        </Box>
      )}

      {/* Step 6: Test */}
      {status.key_uploaded && status.calendar_id && (
        <Box bg={cardBg} p={5} borderRadius="lg" border="1px solid" borderColor={border} mb={4}>
          <Heading size="md" mb={3}>
            <Flex align="center" gap={2}>
              <Box w={6} h={6} borderRadius="full"
                bg={testResult?.connected ? "green.500" : "blue.500"} color="white"
                display="flex" alignItems="center" justifyContent="center"
                fontSize="xs" fontWeight="bold">
                {testResult?.connected ? <Check size={14} /> : "6"}
              </Box>
              Test Connection
              {testResult?.connected && <Check size={16} color="green" />}
            </Flex>
          </Heading>
          <Text fontSize="sm" color={mutedText} mb={3}>
            Verify that everything works by fetching this week's events.
          </Text>

          <Button size="sm" onClick={testConnection}
            disabled={loading === 'test'}
            colorPalette={testResult?.connected ? 'green' : 'blue'}>
            {loading === 'test' ? <Loader2 className="spin" size={14} /> : <Shield size={14} />}
            <Box ml={1}>Test Connection</Box>
          </Button>

          {testResult && testResult.connected && (
            <Box mt={3}>
              <VStack align="stretch" gap={2}>
                <HStack gap={2}>
                  <Check size={16} color="green" />
                  <Text fontSize="sm">
                    {testResult.calendars} calendar(s) accessible,{' '}
                    {testResult.events_this_week} event(s) this week
                  </Text>
                </HStack>

                {testResult.sample_events && testResult.sample_events.length > 0 && (
                  <Box>
                    <Text fontSize="xs" fontWeight="bold" color={mutedText} mb={1}>
                      Upcoming events:
                    </Text>
                    <VStack align="stretch" gap={1}>
                      {testResult.sample_events.map((evt, i) => (
                        <Box key={i} p={2} borderRadius="md" border="1px solid" borderColor={border}
                          fontSize="sm">
                          <Flex justify="space-between" align="center">
                            <Text fontWeight="medium">{evt.title}</Text>
                            <Text fontSize="xs" color={mutedText}>
                              {evt.datetime_start ? new Date(evt.datetime_start).toLocaleDateString(undefined, {
                                weekday: 'short', month: 'short', day: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              }) : '(all day)'}
                            </Text>
                          </Flex>
                        </Box>
                      ))}
                    </VStack>
                  </Box>
                )}

                {testResult.sample_events && testResult.sample_events.length === 0 && (
                  <Text fontSize="sm" color={mutedText}>
                    No events this week — the connection works but the calendar is empty.
                  </Text>
                )}
              </VStack>
            </Box>
          )}
        </Box>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </Box>
  );
}
