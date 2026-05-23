import React, { useEffect, useState, useCallback } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Button, Input } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, RefreshCw, Plus, Settings, BarChart3, DollarSign } from 'lucide-react';
import { recipeAPI } from '../../services/api';

interface WatchlistEntry {
  id: number;
  symbol: string;
  name: string;
  asset_type: string;
  latest_price: number | null;
  latest_date: string | null;
  change: number | null;
  change_pct: number | null;
  sparkline: number[];
}

interface OptionSummary {
  symbol: string;
  snapshot_date: string;
  total_contracts: number;
  expirations: number;
}

interface OverviewData {
  watchlist: WatchlistEntry[];
  option_summary: OptionSummary[];
}

interface OptionContract {
  symbol: string;
  expiration: string;
  strike: number;
  option_type: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume: number | null;
  open_interest: number | null;
  implied_volatility: number | null;
}

interface OptionChainData {
  symbol: string;
  snapshot_date: string | null;
  expirations: string[];
  total_contracts: number;
  contracts: OptionContract[];
}

function MiniSparkline({ data, width = 80, height = 24 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const isUp = data[data.length - 1] >= data[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={isUp ? 'var(--panel-green-text, #22c55e)' : 'var(--panel-red-text, #ef4444)'}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}

const InvestingOverview: React.FC = () => {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [quickAdd, setQuickAdd] = useState('');
  const [adding, setAdding] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [optionChain, setOptionChain] = useState<OptionChainData | null>(null);
  const [selectedExpiration, setSelectedExpiration] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchData = useCallback(() => {
    recipeAPI.request<OverviewData>('/investing/overview')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await recipeAPI.request('/investing/fetch', { method: 'POST' });
      fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  const handleQuickAdd = async () => {
    const sym = quickAdd.trim().toUpperCase();
    if (!sym) return;
    setAdding(true);
    try {
      await recipeAPI.request('/investing/watchlist', {
        method: 'POST',
        body: JSON.stringify({ symbol: sym }),
      });
      setQuickAdd('');
      fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(false);
    }
  };

  const loadOptionChain = async (symbol: string) => {
    setSelectedOption(symbol);
    setSelectedExpiration(null);
    try {
      const chain = await recipeAPI.request<OptionChainData>(`/investing/options/${symbol}`);
      setOptionChain(chain);
      if (chain.expirations.length > 0) {
        setSelectedExpiration(chain.expirations[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (!data || (data.watchlist.length === 0 && data.option_summary.length === 0)) {
    return (
      <VStack gap={6} align="stretch" p={4}>
        <HStack justify="space-between">
          <HStack>
            <TrendingUp size={24} color="var(--icon-color)" />
            <Heading size="lg" color="var(--heading-color)">Investing</Heading>
          </HStack>
          <Button size="sm" variant="ghost" onClick={() => navigate('/settings/investing')}>
            <Settings size={14} />
          </Button>
        </HStack>
        <Flex justify="center" py={12} direction="column" align="center" gap={3}>
          <DollarSign size={48} color="var(--muted-text)" />
          <Text color="var(--muted-text)">No stocks tracked yet.</Text>
          <HStack>
            <Input
              placeholder="Add a symbol (e.g. SPY)"
              value={quickAdd}
              onChange={e => setQuickAdd(e.target.value)}
              size="sm"
              maxW="200px"
              onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
            />
            <Button size="sm" onClick={handleQuickAdd} disabled={adding}>
              <Plus size={14} />
            </Button>
          </HStack>
          <Button size="sm" variant="outline" onClick={() => navigate('/settings/investing')}>
            Configure in Settings
          </Button>
        </Flex>
      </VStack>
    );
  }

  const filteredContracts = optionChain?.contracts.filter(
    c => !selectedExpiration || c.expiration === selectedExpiration
  ) || [];

  const calls = filteredContracts.filter(c => c.option_type === 'call');
  const puts = filteredContracts.filter(c => c.option_type === 'put');

  return (
    <VStack gap={6} align="stretch" p={4}>
      <HStack justify="space-between" flexWrap="wrap" gap={2}>
        <HStack>
          <TrendingUp size={24} color="var(--icon-color)" />
          <Heading size="lg" color="var(--heading-color)">Investing</Heading>
        </HStack>
        <HStack gap={2}>
          <Input
            placeholder="Add symbol..."
            value={quickAdd}
            onChange={e => setQuickAdd(e.target.value)}
            size="sm"
            maxW="140px"
            onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
          />
          <Button size="sm" variant="ghost" onClick={handleQuickAdd} disabled={adding || !quickAdd.trim()}>
            <Plus size={14} />
          </Button>
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Spinner size="xs" /> : <RefreshCw size={14} />}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate('/settings/investing')}>
            <Settings size={14} />
          </Button>
        </HStack>
      </HStack>

      {/* Watchlist */}
      {data.watchlist.length > 0 && (
        <Box>
          <Heading size="md" color="var(--heading-color)" mb={3}>Watchlist</Heading>
          <VStack align="stretch" gap={2}>
            {data.watchlist.map(w => (
              <HStack
                key={w.id}
                p={3}
                bg="var(--card-bg)"
                border="1px solid"
                borderColor="var(--border-color)"
                borderRadius="lg"
                justify="space-between"
                _hover={{ borderColor: 'var(--icon-color)' }}
              >
                <HStack gap={3} flex={1}>
                  <Box minW="60px">
                    <Text fontWeight="bold" fontSize="sm">{w.symbol}</Text>
                    <Text fontSize="2xs" color="var(--muted-text)" lineClamp={1}>{w.name}</Text>
                  </Box>
                  <MiniSparkline data={w.sparkline} />
                </HStack>
                <HStack gap={4}>
                  {w.latest_price !== null && (
                    <Text fontWeight="bold" fontSize="md">
                      ${w.latest_price.toFixed(2)}
                    </Text>
                  )}
                  {w.change !== null && w.change_pct !== null && (
                    <HStack gap={1}>
                      {w.change >= 0 ? (
                        <TrendingUp size={14} color="var(--panel-green-text, #22c55e)" />
                      ) : (
                        <TrendingDown size={14} color="var(--panel-red-text, #ef4444)" />
                      )}
                      <Text
                        fontSize="sm"
                        fontWeight="semibold"
                        color={w.change >= 0 ? 'var(--panel-green-text, #22c55e)' : 'var(--panel-red-text, #ef4444)'}
                      >
                        {w.change >= 0 ? '+' : ''}{w.change.toFixed(2)} ({w.change_pct >= 0 ? '+' : ''}{w.change_pct}%)
                      </Text>
                    </HStack>
                  )}
                  {w.latest_date && (
                    <Text fontSize="2xs" color="var(--muted-text)">{w.latest_date}</Text>
                  )}
                </HStack>
              </HStack>
            ))}
          </VStack>
        </Box>
      )}

      {/* Options Summary */}
      {data.option_summary.length > 0 && (
        <Box>
          <Heading size="md" color="var(--heading-color)" mb={3}>Option Chains</Heading>
          <Grid templateColumns="repeat(auto-fill, minmax(220px, 1fr))" gap={3}>
            {data.option_summary.map(o => (
              <Box
                key={o.symbol}
                p={3}
                bg="var(--card-bg)"
                border="1px solid"
                borderColor={selectedOption === o.symbol ? 'var(--icon-color)' : 'var(--border-color)'}
                borderRadius="lg"
                cursor="pointer"
                _hover={{ borderColor: 'var(--icon-color)' }}
                onClick={() => loadOptionChain(o.symbol)}
              >
                <HStack justify="space-between" mb={2}>
                  <HStack>
                    <BarChart3 size={16} color="var(--icon-color)" />
                    <Text fontWeight="bold">{o.symbol}</Text>
                  </HStack>
                  <Badge colorPalette="purple" fontSize="xs">{o.total_contracts} contracts</Badge>
                </HStack>
                <Text fontSize="xs" color="var(--muted-text)">
                  {o.expirations} expirations · snapshot {o.snapshot_date}
                </Text>
              </Box>
            ))}
          </Grid>
        </Box>
      )}

      {/* Option Chain Detail */}
      {optionChain && optionChain.contracts.length > 0 && (
        <Box>
          <HStack mb={3} justify="space-between" flexWrap="wrap" gap={2}>
            <Heading size="md" color="var(--heading-color)">{optionChain.symbol} Options</Heading>
            <HStack gap={1} flexWrap="wrap">
              {optionChain.expirations.map(exp => (
                <Button
                  key={exp}
                  size="xs"
                  variant={selectedExpiration === exp ? 'solid' : 'outline'}
                  colorPalette={selectedExpiration === exp ? 'blue' : 'gray'}
                  onClick={() => setSelectedExpiration(exp)}
                >
                  {exp}
                </Button>
              ))}
            </HStack>
          </HStack>

          <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
            {/* Calls */}
            <Box>
              <Text fontSize="sm" fontWeight="bold" mb={2} color="var(--panel-green-text, #22c55e)">
                Calls ({calls.length})
              </Text>
              <Box overflowX="auto">
                <Box as="table" w="100%" fontSize="xs">
                  <Box as="thead">
                    <Box as="tr" borderBottom="1px solid" borderColor="var(--border-color)">
                      <Box as="th" p={1} textAlign="right">Strike</Box>
                      <Box as="th" p={1} textAlign="right">Last</Box>
                      <Box as="th" p={1} textAlign="right">Bid</Box>
                      <Box as="th" p={1} textAlign="right">Ask</Box>
                      <Box as="th" p={1} textAlign="right">Vol</Box>
                      <Box as="th" p={1} textAlign="right">OI</Box>
                      <Box as="th" p={1} textAlign="right">IV</Box>
                    </Box>
                  </Box>
                  <Box as="tbody">
                    {calls.slice(0, 30).map((c, i) => (
                      <Box as="tr" key={i} _hover={{ bg: 'var(--hover-bg)' }}>
                        <Box as="td" p={1} textAlign="right" fontWeight="semibold">{c.strike}</Box>
                        <Box as="td" p={1} textAlign="right">{c.last?.toFixed(2) ?? '-'}</Box>
                        <Box as="td" p={1} textAlign="right">{c.bid?.toFixed(2) ?? '-'}</Box>
                        <Box as="td" p={1} textAlign="right">{c.ask?.toFixed(2) ?? '-'}</Box>
                        <Box as="td" p={1} textAlign="right">{c.volume ?? '-'}</Box>
                        <Box as="td" p={1} textAlign="right">{c.open_interest ?? '-'}</Box>
                        <Box as="td" p={1} textAlign="right">{c.implied_volatility ? (c.implied_volatility * 100).toFixed(1) + '%' : '-'}</Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>
            </Box>

            {/* Puts */}
            <Box>
              <Text fontSize="sm" fontWeight="bold" mb={2} color="var(--panel-red-text, #ef4444)">
                Puts ({puts.length})
              </Text>
              <Box overflowX="auto">
                <Box as="table" w="100%" fontSize="xs">
                  <Box as="thead">
                    <Box as="tr" borderBottom="1px solid" borderColor="var(--border-color)">
                      <Box as="th" p={1} textAlign="right">Strike</Box>
                      <Box as="th" p={1} textAlign="right">Last</Box>
                      <Box as="th" p={1} textAlign="right">Bid</Box>
                      <Box as="th" p={1} textAlign="right">Ask</Box>
                      <Box as="th" p={1} textAlign="right">Vol</Box>
                      <Box as="th" p={1} textAlign="right">OI</Box>
                      <Box as="th" p={1} textAlign="right">IV</Box>
                    </Box>
                  </Box>
                  <Box as="tbody">
                    {puts.slice(0, 30).map((c, i) => (
                      <Box as="tr" key={i} _hover={{ bg: 'var(--hover-bg)' }}>
                        <Box as="td" p={1} textAlign="right" fontWeight="semibold">{c.strike}</Box>
                        <Box as="td" p={1} textAlign="right">{c.last?.toFixed(2) ?? '-'}</Box>
                        <Box as="td" p={1} textAlign="right">{c.bid?.toFixed(2) ?? '-'}</Box>
                        <Box as="td" p={1} textAlign="right">{c.ask?.toFixed(2) ?? '-'}</Box>
                        <Box as="td" p={1} textAlign="right">{c.volume ?? '-'}</Box>
                        <Box as="td" p={1} textAlign="right">{c.open_interest ?? '-'}</Box>
                        <Box as="td" p={1} textAlign="right">{c.implied_volatility ? (c.implied_volatility * 100).toFixed(1) + '%' : '-'}</Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>
            </Box>
          </Grid>
        </Box>
      )}
    </VStack>
  );
};

export default InvestingOverview;
