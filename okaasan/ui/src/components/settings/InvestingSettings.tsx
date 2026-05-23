import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Text, Heading, Input, Button, Badge, Spinner } from '@chakra-ui/react';
import { TrendingUp, ArrowLeft, Plus, Trash2, RefreshCw, Key, Settings } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface InvestingStatus {
  has_alpaca_key: boolean;
  refresh_interval_minutes: number;
  option_symbols: string[];
  last_refresh: string | null;
  last_error: string | null;
  total_price_rows: number;
  total_option_snapshots: number;
  total_historical_bars: number;
  watchlist_count: number;
}

interface WatchlistEntry {
  id: number;
  symbol: string;
  name: string;
  asset_type: string;
  added_at: string;
}

const InvestingSettings: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<InvestingStatus | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [newSymbol, setNewSymbol] = useState('');
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [alpacaKey, setAlpacaKey] = useState('');
  const [alpacaSecret, setAlpacaSecret] = useState('');
  const [optionSymbols, setOptionSymbols] = useState('SPY');
  const [refreshInterval, setRefreshInterval] = useState(60);
  const [saving, setSaving] = useState(false);

  const fetchStatus = () => {
    recipeAPI.request<InvestingStatus>('/investing/status').then(setStatus).catch(console.error);
    recipeAPI.request<WatchlistEntry[]>('/investing/watchlist').then(setWatchlist).catch(console.error);
  };

  useEffect(() => { fetchStatus(); }, []);

  useEffect(() => {
    if (status) {
      setOptionSymbols(status.option_symbols.join(', '));
      setRefreshInterval(status.refresh_interval_minutes);
    }
  }, [status]);

  const addSymbol = async () => {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym) return;
    setAdding(true);
    try {
      await recipeAPI.request('/investing/watchlist', {
        method: 'POST',
        body: JSON.stringify({ symbol: sym }),
      });
      setNewSymbol('');
      fetchStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(false);
    }
  };

  const removeSymbol = async (symbol: string) => {
    try {
      await recipeAPI.request(`/investing/watchlist/${symbol}`, { method: 'DELETE' });
      fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await recipeAPI.request('/investing/configure', {
        method: 'POST',
        body: JSON.stringify({
          alpaca_api_key: alpacaKey || undefined,
          alpaca_secret_key: alpacaSecret || undefined,
          option_symbols: optionSymbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
          refresh_interval_minutes: refreshInterval,
        }),
      });
      fetchStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const triggerRefresh = async () => {
    setRefreshing(true);
    try {
      await recipeAPI.request('/investing/fetch', { method: 'POST' });
      fetchStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <VStack gap={6} align="stretch" p={4} maxW="700px">
      <HStack>
        <Button size="sm" variant="ghost" onClick={() => navigate('/settings')}>
          <ArrowLeft size={16} />
        </Button>
        <TrendingUp size={24} color="var(--icon-color)" />
        <Heading size="lg" color="var(--heading-color)">Investing Settings</Heading>
      </HStack>

      {/* Status Overview */}
      {status && (
        <Box bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" p={4}>
          <Heading size="sm" mb={3} color="var(--heading-color)">Status</Heading>
          <VStack align="stretch" gap={2}>
            <HStack justify="space-between">
              <Text fontSize="sm" color="var(--muted-text)">Watchlist symbols</Text>
              <Badge colorPalette="blue">{status.watchlist_count}</Badge>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="sm" color="var(--muted-text)">Price data points</Text>
              <Badge colorPalette="green">{status.total_price_rows.toLocaleString()}</Badge>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="sm" color="var(--muted-text)">Option snapshots</Text>
              <Badge colorPalette="purple">{status.total_option_snapshots.toLocaleString()}</Badge>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="sm" color="var(--muted-text)">Historical option bars</Text>
              <Badge colorPalette="orange">{status.total_historical_bars.toLocaleString()}</Badge>
            </HStack>
            <HStack justify="space-between">
              <Text fontSize="sm" color="var(--muted-text)">Alpaca API configured</Text>
              <Badge colorPalette={status.has_alpaca_key ? 'green' : 'gray'}>
                {status.has_alpaca_key ? 'Yes' : 'No'}
              </Badge>
            </HStack>
            {status.last_refresh && (
              <HStack justify="space-between">
                <Text fontSize="sm" color="var(--muted-text)">Last refresh</Text>
                <Text fontSize="xs" color="var(--muted-text)">{new Date(status.last_refresh).toLocaleString()}</Text>
              </HStack>
            )}
            {status.last_error && (
              <Text fontSize="xs" color="red.500">Error: {status.last_error}</Text>
            )}
          </VStack>
          <Button size="sm" mt={3} variant="outline" onClick={triggerRefresh} disabled={refreshing}>
            {refreshing ? <Spinner size="xs" /> : <RefreshCw size={14} />}
            <Text ml={1}>{refreshing ? 'Refreshing...' : 'Refresh Now'}</Text>
          </Button>
        </Box>
      )}

      {/* Watchlist */}
      <Box bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" p={4}>
        <Heading size="sm" mb={3} color="var(--heading-color)">Watchlist</Heading>
        <HStack mb={3}>
          <Input
            placeholder="Add symbol (e.g. AAPL)"
            value={newSymbol}
            onChange={e => setNewSymbol(e.target.value)}
            size="sm"
            maxW="200px"
            onKeyDown={e => e.key === 'Enter' && addSymbol()}
          />
          <Button size="sm" onClick={addSymbol} disabled={adding || !newSymbol.trim()}>
            {adding ? <Spinner size="xs" /> : <Plus size={14} />}
            <Text ml={1}>Add</Text>
          </Button>
        </HStack>
        {watchlist.length === 0 ? (
          <Text fontSize="sm" color="var(--muted-text)">No symbols in watchlist yet.</Text>
        ) : (
          <VStack align="stretch" gap={1}>
            {watchlist.map(w => (
              <HStack key={w.id} justify="space-between" py={1} px={2} borderRadius="md" _hover={{ bg: 'var(--hover-bg)' }}>
                <HStack>
                  <Badge colorPalette="blue" fontSize="xs">{w.symbol}</Badge>
                  <Text fontSize="sm">{w.name}</Text>
                </HStack>
                <Button size="xs" variant="ghost" onClick={() => removeSymbol(w.symbol)} title="Remove">
                  <Trash2 size={12} />
                </Button>
              </HStack>
            ))}
          </VStack>
        )}
      </Box>

      {/* Alpaca API Keys */}
      <Box bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" p={4}>
        <HStack mb={3}>
          <Key size={16} color="var(--icon-color)" />
          <Heading size="sm" color="var(--heading-color)">Alpaca API Keys</Heading>
        </HStack>
        <Text fontSize="xs" color="var(--muted-text)" mb={3}>
          Required for historical option data. Get free keys at alpaca.markets.
        </Text>
        <VStack align="stretch" gap={2}>
          <Box>
            <Text fontSize="xs" fontWeight="bold" mb={1}>API Key</Text>
            <Input
              placeholder="ALPACA_API_KEY"
              value={alpacaKey}
              onChange={e => setAlpacaKey(e.target.value)}
              size="sm"
              type="password"
            />
          </Box>
          <Box>
            <Text fontSize="xs" fontWeight="bold" mb={1}>Secret Key</Text>
            <Input
              placeholder="ALPACA_SECRET_KEY"
              value={alpacaSecret}
              onChange={e => setAlpacaSecret(e.target.value)}
              size="sm"
              type="password"
            />
          </Box>
        </VStack>
      </Box>

      {/* General Settings */}
      <Box bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" p={4}>
        <HStack mb={3}>
          <Settings size={16} color="var(--icon-color)" />
          <Heading size="sm" color="var(--heading-color)">General</Heading>
        </HStack>
        <VStack align="stretch" gap={3}>
          <Box>
            <Text fontSize="xs" fontWeight="bold" mb={1}>Option chain symbols (comma-separated)</Text>
            <Input
              value={optionSymbols}
              onChange={e => setOptionSymbols(e.target.value)}
              size="sm"
              placeholder="SPY, QQQ"
            />
          </Box>
          <Box>
            <Text fontSize="xs" fontWeight="bold" mb={1}>Refresh interval (minutes)</Text>
            <Input
              type="number"
              value={refreshInterval}
              onChange={e => setRefreshInterval(Number(e.target.value))}
              size="sm"
              maxW="120px"
            />
          </Box>
        </VStack>
      </Box>

      <Button onClick={saveConfig} disabled={saving} colorPalette="blue">
        {saving ? <Spinner size="xs" /> : null}
        <Text ml={saving ? 1 : 0}>Save Configuration</Text>
      </Button>
    </VStack>
  );
};

export default InvestingSettings;
