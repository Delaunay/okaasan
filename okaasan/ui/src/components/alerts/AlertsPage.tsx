import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Heading, Text, VStack, HStack, Badge, Button, Input, Flex,
  Tabs, SimpleGrid, Separator,
} from '@chakra-ui/react';
import {
  DialogRoot, DialogContent, DialogBackdrop, DialogPositioner,
} from '@chakra-ui/react';
import {
  Bell, Plus, Trash2, Pencil, Send, Power, PowerOff, Check, AlertTriangle, Info,
} from 'lucide-react';
import { recipeAPI } from '../../services/api';

// ─── Types ──────────────────────────────────────────────────

interface AlertRule {
  id: number;
  name: string;
  enabled: boolean;
  source: string;
  metric_path: string;
  condition: string;
  threshold: any;
  urgency: string;
  cooldown_seconds: number;
  resolve_on_clear: boolean;
  broadcaster_ids: number[];
  created_at: string;
  updated_at: string;
  last_event?: AlertEvent | null;
}

interface AlertEvent {
  id: number;
  rule_id: number;
  fired_at: string;
  resolved_at: string | null;
  value_snapshot: any;
  message: string;
  status: string;
}

interface AlertBroadcaster {
  id: number;
  name: string;
  type: string;
  config: Record<string, string>;
  enabled: boolean;
  destinations: AlertDestination[];
}

interface AlertDestination {
  id: number;
  broadcaster_id: number;
  label: string;
  target: string;
}

interface MetricInfo {
  source: string;
  source_name: string;
  path: string;
  full_path: string;
  label: string;
  unit: string;
}

interface BroadcasterType {
  type_id: string;
  display_name: string;
}

// ─── Component ──────────────────────────────────────────────

const URGENCY_COLORS: Record<string, string> = {
  critical: 'red',
  warning: 'orange',
  info: 'blue',
};

const CONDITIONS = [
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '>=' },
  { value: 'lte', label: '<=' },
  { value: 'eq', label: '==' },
  { value: 'neq', label: '!=' },
  { value: 'contains', label: 'contains' },
];

const AlertsPage: React.FC = () => {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [broadcasters, setBroadcasters] = useState<AlertBroadcaster[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [metrics, setMetrics] = useState<MetricInfo[]>([]);
  const [broadcasterTypes, setBroadcasterTypes] = useState<BroadcasterType[]>([]);
  const [activeTab, setActiveTab] = useState('rules');

  // Rule editor state
  const [editingRule, setEditingRule] = useState<Partial<AlertRule> | null>(null);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);

  // Broadcaster editor state
  const [editingBroadcaster, setEditingBroadcaster] = useState<any>(null);
  const [bcModalOpen, setBcModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [rulesRes, bcRes, eventsRes, metricsRes, typesRes] = await Promise.all([
        recipeAPI.request<AlertRule[]>('/alerts/rules'),
        recipeAPI.request<AlertBroadcaster[]>('/alerts/broadcasters'),
        recipeAPI.request<AlertEvent[]>('/alerts/events?limit=50'),
        recipeAPI.request<MetricInfo[]>('/alerts/sources'),
        recipeAPI.request<BroadcasterType[]>('/alerts/broadcaster-types'),
      ]);
      setRules(rulesRes);
      setBroadcasters(bcRes);
      setEvents(eventsRes);
      setMetrics(metricsRes);
      setBroadcasterTypes(typesRes);
    } catch (err) {
      console.error('Failed to fetch alerts data', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ─── Rule CRUD ──────────────────────────────────────────

  const saveRule = async () => {
    if (!editingRule) return;
    try {
      if (editingRule.id) {
        await recipeAPI.request(`/alerts/rules/${editingRule.id}`, { method: 'PUT', body: editingRule });
      } else {
        await recipeAPI.request('/alerts/rules', { method: 'POST', body: editingRule });
      }
      setRuleModalOpen(false);
      setEditingRule(null);
      fetchData();
    } catch (err) {
      console.error('Failed to save rule', err);
    }
  };

  const deleteRule = async (id: number) => {
    try {
      await recipeAPI.request(`/alerts/rules/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error('Failed to delete rule', err);
    }
  };

  const toggleRule = async (rule: AlertRule) => {
    try {
      await recipeAPI.request(`/alerts/rules/${rule.id}`, {
        method: 'PUT',
        body: { enabled: !rule.enabled },
      });
      fetchData();
    } catch (err) {
      console.error('Failed to toggle rule', err);
    }
  };

  // ─── Broadcaster CRUD ──────────────────────────────────

  const saveBroadcaster = async () => {
    if (!editingBroadcaster) return;
    try {
      if (editingBroadcaster.id) {
        await recipeAPI.request(`/alerts/broadcasters/${editingBroadcaster.id}`, {
          method: 'PUT', body: editingBroadcaster,
        });
      } else {
        await recipeAPI.request('/alerts/broadcasters', {
          method: 'POST', body: editingBroadcaster,
        });
      }
      setBcModalOpen(false);
      setEditingBroadcaster(null);
      fetchData();
    } catch (err) {
      console.error('Failed to save broadcaster', err);
    }
  };

  const deleteBroadcaster = async (id: number) => {
    try {
      await recipeAPI.request(`/alerts/broadcasters/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error('Failed to delete broadcaster', err);
    }
  };

  const testBroadcaster = async (id: number) => {
    try {
      await recipeAPI.request(`/alerts/broadcasters/${id}/test`, { method: 'POST', body: {} });
    } catch (err) {
      console.error('Failed to test broadcaster', err);
    }
  };

  const acknowledgeEvent = async (id: number) => {
    try {
      await recipeAPI.request(`/alerts/events/${id}/acknowledge`, { method: 'POST' });
      fetchData();
    } catch (err) {
      console.error('Failed to acknowledge event', err);
    }
  };

  // ─── Render ─────────────────────────────────────────────

  return (
    <Box p={6} maxW="6xl" mx="auto">
      <HStack mb={6} gap={3}>
        <Bell size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)">Alerts</Heading>
      </HStack>

      <Tabs.Root value={activeTab} onValueChange={(e) => setActiveTab(e.value)}>
        <Tabs.List mb={4}>
          <Tabs.Trigger value="rules">Rules</Tabs.Trigger>
          <Tabs.Trigger value="broadcasters">Broadcasters</Tabs.Trigger>
          <Tabs.Trigger value="events">Event Log</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="rules">
          <RulesTab
            rules={rules}
            broadcasters={broadcasters}
            onEdit={(r) => { setEditingRule(r); setRuleModalOpen(true); }}
            onDelete={deleteRule}
            onToggle={toggleRule}
            onNew={() => {
              setEditingRule({
                name: '', source: '', metric_path: '', condition: 'gt',
                threshold: 0, urgency: 'info', cooldown_seconds: 3600,
                resolve_on_clear: true, broadcaster_ids: [], enabled: true,
              });
              setRuleModalOpen(true);
            }}
          />
        </Tabs.Content>

        <Tabs.Content value="broadcasters">
          <BroadcastersTab
            broadcasters={broadcasters}
            broadcasterTypes={broadcasterTypes}
            onEdit={(bc) => { setEditingBroadcaster(bc); setBcModalOpen(true); }}
            onDelete={deleteBroadcaster}
            onTest={testBroadcaster}
            onNew={() => {
              setEditingBroadcaster({ name: '', type: 'telegram', config: {}, enabled: true });
              setBcModalOpen(true);
            }}
          />
        </Tabs.Content>

        <Tabs.Content value="events">
          <EventsTab events={events} rules={rules} onAcknowledge={acknowledgeEvent} />
        </Tabs.Content>
      </Tabs.Root>

      {/* Rule Editor Modal */}
      <DialogRoot open={ruleModalOpen} onOpenChange={(e) => setRuleModalOpen(e.open)} placement="center">
        <DialogBackdrop />
        <DialogPositioner>
          <DialogContent p={6} bg="var(--card-bg-raised)" borderRadius="lg" maxW="lg" w="90vw">
            <RuleEditorModal
              rule={editingRule}
              metrics={metrics}
              broadcasters={broadcasters}
              onChange={setEditingRule}
              onSave={saveRule}
              onClose={() => setRuleModalOpen(false)}
            />
          </DialogContent>
        </DialogPositioner>
      </DialogRoot>

      {/* Broadcaster Editor Modal */}
      <DialogRoot open={bcModalOpen} onOpenChange={(e) => setBcModalOpen(e.open)} placement="center">
        <DialogBackdrop />
        <DialogPositioner>
          <DialogContent p={6} bg="var(--card-bg-raised)" borderRadius="lg" maxW="md" w="90vw">
            <BroadcasterEditorModal
              broadcaster={editingBroadcaster}
              broadcasterTypes={broadcasterTypes}
              onChange={setEditingBroadcaster}
              onSave={saveBroadcaster}
              onClose={() => setBcModalOpen(false)}
            />
          </DialogContent>
        </DialogPositioner>
      </DialogRoot>
    </Box>
  );
};

// ─── Rules Tab ────────────────────────────────────────────

const RulesTab: React.FC<{
  rules: AlertRule[];
  broadcasters: AlertBroadcaster[];
  onEdit: (rule: AlertRule) => void;
  onDelete: (id: number) => void;
  onToggle: (rule: AlertRule) => void;
  onNew: () => void;
}> = ({ rules, broadcasters, onEdit, onDelete, onToggle, onNew }) => (
  <VStack align="stretch" gap={3}>
    <HStack justify="space-between">
      <Text color="var(--muted-text)" fontSize="sm">{rules.length} rule(s) configured</Text>
      <Button size="sm" colorPalette="blue" onClick={onNew}>
        <Plus size={14} /> Add Rule
      </Button>
    </HStack>

    {rules.length === 0 && (
      <Box p={8} textAlign="center" bg="var(--surface-muted)" borderRadius="md">
        <Text color="var(--empty-text)">No alert rules configured yet</Text>
      </Box>
    )}

    {rules.map((rule) => {
      const bcNames = broadcasters
        .filter(b => rule.broadcaster_ids.includes(b.id))
        .map(b => b.name);
      return (
        <Box
          key={rule.id}
          p={4}
          bg="var(--card-bg)"
          borderRadius="md"
          borderWidth="1px"
          borderColor="var(--border-color)"
        >
          <HStack justify="space-between" mb={2}>
            <HStack gap={2}>
              <Badge colorPalette={URGENCY_COLORS[rule.urgency] || 'gray'} fontSize="2xs">
                {rule.urgency}
              </Badge>
              <Text fontWeight="semibold">{rule.name}</Text>
              {!rule.enabled && <Badge colorPalette="gray" fontSize="2xs">Disabled</Badge>}
            </HStack>
            <HStack gap={1}>
              <Button size="xs" variant="ghost" onClick={() => onToggle(rule)} title={rule.enabled ? 'Disable' : 'Enable'}>
                {rule.enabled ? <Power size={14} /> : <PowerOff size={14} />}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => onEdit(rule)}>
                <Pencil size={14} />
              </Button>
              <Button size="xs" variant="ghost" colorPalette="red" onClick={() => onDelete(rule.id)}>
                <Trash2 size={14} />
              </Button>
            </HStack>
          </HStack>
          <Text fontSize="sm" color="var(--muted-text)">
            {rule.source}.{rule.metric_path} {CONDITIONS.find(c => c.value === rule.condition)?.label} {JSON.stringify(rule.threshold)}
          </Text>
          <HStack mt={1} gap={2} fontSize="xs" color="var(--muted-text)">
            {bcNames.length > 0 && <Text>→ {bcNames.join(', ')}</Text>}
            {rule.last_event && (
              <Badge colorPalette={rule.last_event.status === 'active' ? 'red' : 'green'} fontSize="2xs">
                Last: {rule.last_event.status}
              </Badge>
            )}
          </HStack>
        </Box>
      );
    })}
  </VStack>
);

// ─── Broadcasters Tab ─────────────────────────────────────

const BroadcastersTab: React.FC<{
  broadcasters: AlertBroadcaster[];
  broadcasterTypes: BroadcasterType[];
  onEdit: (bc: AlertBroadcaster) => void;
  onDelete: (id: number) => void;
  onTest: (id: number) => void;
  onNew: () => void;
}> = ({ broadcasters, broadcasterTypes, onEdit, onDelete, onTest, onNew }) => (
  <VStack align="stretch" gap={3}>
    <HStack justify="space-between">
      <Text color="var(--muted-text)" fontSize="sm">{broadcasters.length} broadcaster(s)</Text>
      <Button size="sm" colorPalette="blue" onClick={onNew}>
        <Plus size={14} /> Add Broadcaster
      </Button>
    </HStack>

    {broadcasters.length === 0 && (
      <Box p={8} textAlign="center" bg="var(--surface-muted)" borderRadius="md">
        <Text color="var(--empty-text)">No broadcasters configured. Add one to receive alerts.</Text>
      </Box>
    )}

    <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
      {broadcasters.map((bc) => (
        <Box
          key={bc.id}
          p={4}
          bg="var(--card-bg)"
          borderRadius="md"
          borderWidth="1px"
          borderColor="var(--border-color)"
        >
          <HStack justify="space-between" mb={2}>
            <HStack gap={2}>
              <Text fontWeight="semibold">{bc.name}</Text>
              <Badge fontSize="2xs">{bc.type}</Badge>
            </HStack>
            <HStack gap={1}>
              <Button size="xs" variant="ghost" onClick={() => onTest(bc.id)} title="Send test">
                <Send size={14} />
              </Button>
              <Button size="xs" variant="ghost" onClick={() => onEdit(bc)}>
                <Pencil size={14} />
              </Button>
              <Button size="xs" variant="ghost" colorPalette="red" onClick={() => onDelete(bc.id)}>
                <Trash2 size={14} />
              </Button>
            </HStack>
          </HStack>
          {bc.destinations.length > 0 && (
            <VStack align="stretch" gap={0} mt={1}>
              {bc.destinations.map(d => (
                <Text key={d.id} fontSize="xs" color="var(--muted-text)">
                  {d.label}: {d.target}
                </Text>
              ))}
            </VStack>
          )}
        </Box>
      ))}
    </SimpleGrid>
  </VStack>
);

// ─── Events Tab ───────────────────────────────────────────

const EventsTab: React.FC<{
  events: AlertEvent[];
  rules: AlertRule[];
  onAcknowledge: (id: number) => void;
}> = ({ events, rules, onAcknowledge }) => (
  <VStack align="stretch" gap={2}>
    {events.length === 0 && (
      <Box p={8} textAlign="center" bg="var(--surface-muted)" borderRadius="md">
        <Text color="var(--empty-text)">No alert events fired yet</Text>
      </Box>
    )}

    {events.map((evt) => {
      const rule = rules.find(r => r.id === evt.rule_id);
      const statusColor = evt.status === 'active' ? 'red' : evt.status === 'acknowledged' ? 'yellow' : 'green';
      return (
        <Box
          key={evt.id}
          p={3}
          bg="var(--card-bg)"
          borderRadius="md"
          borderWidth="1px"
          borderColor="var(--border-color)"
        >
          <HStack justify="space-between">
            <HStack gap={2}>
              {evt.status === 'active' && <AlertTriangle size={14} color="var(--panel-red-text)" />}
              {evt.status === 'resolved' && <Check size={14} color="var(--panel-green-text)" />}
              {evt.status === 'acknowledged' && <Info size={14} color="var(--panel-orange-text)" />}
              <Text fontSize="sm" fontWeight="medium">{rule?.name || `Rule #${evt.rule_id}`}</Text>
              <Badge colorPalette={statusColor} fontSize="2xs">{evt.status}</Badge>
            </HStack>
            {evt.status === 'active' && (
              <Button size="xs" variant="ghost" onClick={() => onAcknowledge(evt.id)} title="Acknowledge">
                <Check size={14} />
              </Button>
            )}
          </HStack>
          <HStack mt={1} gap={3} fontSize="xs" color="var(--muted-text)">
            <Text>Fired: {new Date(evt.fired_at).toLocaleString()}</Text>
            {evt.resolved_at && <Text>Resolved: {new Date(evt.resolved_at).toLocaleString()}</Text>}
            {evt.value_snapshot !== null && <Text>Value: {JSON.stringify(evt.value_snapshot)}</Text>}
          </HStack>
        </Box>
      );
    })}
  </VStack>
);

// ─── Rule Editor Modal ────────────────────────────────────

const RuleEditorModal: React.FC<{
  rule: Partial<AlertRule> | null;
  metrics: MetricInfo[];
  broadcasters: AlertBroadcaster[];
  onChange: (r: Partial<AlertRule> | null) => void;
  onSave: () => void;
  onClose: () => void;
}> = ({ rule, metrics, broadcasters, onChange, onSave, onClose }) => {
  if (!rule) return null;

  const sources = [...new Set(metrics.map(m => m.source))];
  const filteredMetrics = metrics.filter(m => m.source === rule.source);

  const update = (field: string, value: any) => {
    onChange({ ...rule, [field]: value });
  };

  return (
    <VStack align="stretch" gap={4}>
      <Heading size="md">{rule.id ? 'Edit Rule' : 'New Rule'}</Heading>

      <Box>
        <Text fontSize="sm" fontWeight="medium" mb={1}>Name</Text>
        <Input
          size="sm"
          value={rule.name || ''}
          onChange={(e) => update('name', e.target.value)}
          placeholder="e.g. Low soil moisture"
        />
      </Box>

      <HStack gap={3}>
        <Box flex={1}>
          <Text fontSize="sm" fontWeight="medium" mb={1}>Source</Text>
          <select
            value={rule.source || ''}
            onChange={(e) => onChange({ ...rule, source: e.target.value, metric_path: '' })}
            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}
          >
            <option value="">Select source...</option>
            {sources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Box>
        <Box flex={2}>
          <Text fontSize="sm" fontWeight="medium" mb={1}>Metric</Text>
          <select
            value={rule.metric_path || ''}
            onChange={(e) => update('metric_path', e.target.value)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}
          >
            <option value="">Select metric...</option>
            {filteredMetrics.map(m => (
              <option key={m.path} value={m.path}>{m.label}{m.unit ? ` (${m.unit})` : ''}</option>
            ))}
          </select>
        </Box>
      </HStack>

      <HStack gap={3}>
        <Box flex={1}>
          <Text fontSize="sm" fontWeight="medium" mb={1}>Condition</Text>
          <select
            value={rule.condition || 'gt'}
            onChange={(e) => update('condition', e.target.value)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}
          >
            {CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Box>
        <Box flex={1}>
          <Text fontSize="sm" fontWeight="medium" mb={1}>Threshold</Text>
          <Input
            size="sm"
            value={rule.threshold ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              update('threshold', isNaN(Number(v)) ? v : Number(v));
            }}
          />
        </Box>
        <Box flex={1}>
          <Text fontSize="sm" fontWeight="medium" mb={1}>Urgency</Text>
          <select
            value={rule.urgency || 'info'}
            onChange={(e) => update('urgency', e.target.value)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}
          >
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </Box>
      </HStack>

      <HStack gap={3}>
        <Box flex={1}>
          <Text fontSize="sm" fontWeight="medium" mb={1}>Cooldown (seconds)</Text>
          <Input
            size="sm"
            type="number"
            value={rule.cooldown_seconds ?? 3600}
            onChange={(e) => update('cooldown_seconds', Number(e.target.value))}
          />
        </Box>
        <Box flex={1}>
          <Text fontSize="sm" fontWeight="medium" mb={1}>Auto-resolve</Text>
          <select
            value={rule.resolve_on_clear ? 'true' : 'false'}
            onChange={(e) => update('resolve_on_clear', e.target.value === 'true')}
            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </Box>
      </HStack>

      <Box>
        <Text fontSize="sm" fontWeight="medium" mb={1}>Broadcasters</Text>
        <VStack align="stretch" gap={1}>
          {broadcasters.map(bc => (
            <label key={bc.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={(rule.broadcaster_ids || []).includes(bc.id)}
                onChange={(e) => {
                  const ids = rule.broadcaster_ids || [];
                  if (e.target.checked) {
                    update('broadcaster_ids', [...ids, bc.id]);
                  } else {
                    update('broadcaster_ids', ids.filter(id => id !== bc.id));
                  }
                }}
              />
              <Text fontSize="sm">{bc.name} ({bc.type})</Text>
            </label>
          ))}
          {broadcasters.length === 0 && (
            <Text fontSize="xs" color="var(--muted-text)">No broadcasters configured — add one in the Broadcasters tab</Text>
          )}
        </VStack>
      </Box>

      <Separator />

      <HStack justify="flex-end" gap={2}>
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          size="sm"
          colorPalette="blue"
          onClick={onSave}
          disabled={!rule.name || !rule.source || !rule.metric_path}
        >
          {rule.id ? 'Update' : 'Create'}
        </Button>
      </HStack>
    </VStack>
  );
};

// ─── Broadcaster Editor Modal ─────────────────────────────

const BroadcasterEditorModal: React.FC<{
  broadcaster: any;
  broadcasterTypes: BroadcasterType[];
  onChange: (bc: any) => void;
  onSave: () => void;
  onClose: () => void;
}> = ({ broadcaster, broadcasterTypes, onChange, onSave, onClose }) => {
  if (!broadcaster) return null;

  const update = (field: string, value: any) => {
    onChange({ ...broadcaster, [field]: value });
  };

  const updateConfig = (key: string, value: string) => {
    onChange({ ...broadcaster, config: { ...broadcaster.config, [key]: value } });
  };

  return (
    <VStack align="stretch" gap={4}>
      <Heading size="md">{broadcaster.id ? 'Edit Broadcaster' : 'New Broadcaster'}</Heading>

      <Box>
        <Text fontSize="sm" fontWeight="medium" mb={1}>Name</Text>
        <Input
          size="sm"
          value={broadcaster.name || ''}
          onChange={(e) => update('name', e.target.value)}
          placeholder="e.g. My Telegram Bot"
        />
      </Box>

      <Box>
        <Text fontSize="sm" fontWeight="medium" mb={1}>Type</Text>
        <select
          value={broadcaster.type || 'telegram'}
          onChange={(e) => update('type', e.target.value)}
          style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}
        >
          {broadcasterTypes.map(t => (
            <option key={t.type_id} value={t.type_id}>{t.display_name}</option>
          ))}
        </select>
      </Box>

      {broadcaster.type === 'telegram' && (
        <>
          <Box>
            <Text fontSize="sm" fontWeight="medium" mb={1}>Bot Token</Text>
            <Input
              size="sm"
              value={broadcaster.config?.bot_token || ''}
              onChange={(e) => updateConfig('bot_token', e.target.value)}
              placeholder="123456:ABC-DEF1234..."
            />
          </Box>
          <Box>
            <Text fontSize="sm" fontWeight="medium" mb={1}>Chat ID</Text>
            <Input
              size="sm"
              value={broadcaster.config?.chat_id || ''}
              onChange={(e) => updateConfig('chat_id', e.target.value)}
              placeholder="Your Telegram chat ID"
            />
          </Box>
        </>
      )}

      {broadcaster.type === 'webhook' && (
        <Box>
          <Text fontSize="sm" fontWeight="medium" mb={1}>Webhook URL</Text>
          <Input
            size="sm"
            value={broadcaster.config?.url || ''}
            onChange={(e) => updateConfig('url', e.target.value)}
            placeholder="https://..."
          />
        </Box>
      )}

      <Separator />

      <HStack justify="flex-end" gap={2}>
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          size="sm"
          colorPalette="blue"
          onClick={onSave}
          disabled={!broadcaster.name || !broadcaster.type}
        >
          {broadcaster.id ? 'Update' : 'Create'}
        </Button>
      </HStack>
    </VStack>
  );
};

export default AlertsPage;
