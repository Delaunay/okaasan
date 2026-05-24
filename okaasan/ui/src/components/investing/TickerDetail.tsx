import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Flex, Heading, Text, HStack, VStack, Spinner, Badge, Button } from '@chakra-ui/react';
import { ArrowLeft, TrendingUp, TrendingDown, BarChart3, RefreshCw } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import VegaPlot from '../health/VegaPlot';
import { VegaProvider } from '../../contexts/VegaContext';

interface TickerInfo {
  symbol: string;
  name: string;
  asset_type: string | null;
  on_watchlist: boolean;
  latest_price: number | null;
  latest_date: string | null;
  change: number | null;
  change_pct: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  volume: number | null;
  total_price_rows: number;
  date_range: { start: string; end: string } | null;
  has_options: boolean;
}

interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function formatVolume(v: number): string {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'B';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return String(v);
}

const TickerDetail: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<TickerInfo | null>(null);
  const [prices, setPrices] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'ALL'>('3M');
  const [volWindow, setVolWindow] = useState(20);
  const [backfilling, setBackfilling] = useState(false);

  const fetchInfo = useCallback(() => {
    if (!symbol) return;
    recipeAPI.request<TickerInfo>(`/investing/ticker/${symbol}`)
      .then(setInfo)
      .catch(e => setError(e.message || 'Failed to load ticker'));
  }, [symbol]);

  const fetchPrices = useCallback(() => {
    if (!symbol) return;
    let start: string | undefined;
    if (range !== 'ALL') {
      const d = new Date();
      const months = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[range];
      d.setMonth(d.getMonth() - months);
      start = d.toISOString().slice(0, 10);
    }
    const qs = start ? `?start=${start}` : '';
    recipeAPI.request<{ symbol: string; prices: PricePoint[] }>(`/investing/prices/${symbol}${qs}`)
      .then(d => setPrices(d.prices))
      .catch(e => setError(e.message || 'Failed to load prices'));
  }, [symbol, range]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchInfo(), fetchPrices()])
      .finally(() => setLoading(false));
  }, [fetchInfo, fetchPrices]);

  const chartSpec = useMemo(() => {
    if (prices.length === 0) return null;

    const closes = prices.map(p => p.close);
    const withDir = prices.map((p, i) => {
      let std: number | null = null;
      if (i >= volWindow - 1) {
        const win = closes.slice(i - volWindow + 1, i + 1);
        const mean = win.reduce((a, b) => a + b, 0) / win.length;
        const variance = win.reduce((a, b) => a + (b - mean) ** 2, 0) / win.length;
        std = Math.sqrt(variance);
      }
      return { ...p, up: p.close >= p.open, rolling_std: std };
    });

    const tooltip = [
      { field: 'date', type: 'temporal' as const, title: 'Date' },
      { field: 'open', type: 'quantitative' as const, title: 'Open', format: '.2f' },
      { field: 'high', type: 'quantitative' as const, title: 'High', format: '.2f' },
      { field: 'low', type: 'quantitative' as const, title: 'Low', format: '.2f' },
      { field: 'close', type: 'quantitative' as const, title: 'Close', format: '.2f' },
      { field: 'volume', type: 'quantitative' as const, title: 'Volume', format: ',' },
    ];
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: { values: withDir },
      padding: { right: 20, top: 20 },
      vconcat: [
        {
          width: 'container' as const,
          height: 280,
          encoding: { x: { field: 'date', type: 'temporal', title: null, axis: null, scale: { zero: false, padding: 10 } } },
          layer: [
            {
              mark: { type: 'area', interpolate: 'monotone', opacity: 0.12, color: '#94a3b8' },
              encoding: {
                y: { field: 'high', type: 'quantitative', title: 'Price ($)', scale: { zero: false }, axis: { titlePadding: 16 } },
                y2: { field: 'low' },
                tooltip,
              },
            },
            {
              mark: { type: 'line', interpolate: 'monotone', strokeWidth: 1.5, color: '#8b5cf6', strokeDash: [4, 3] },
              encoding: { y: { field: 'open', type: 'quantitative', scale: { zero: false } }, tooltip },
            },
            {
              mark: { type: 'line', interpolate: 'monotone', strokeWidth: 2, color: '#3b82f6' },
              encoding: { y: { field: 'close', type: 'quantitative', scale: { zero: false } }, tooltip },
            },
          ],
        },
        {
          width: 'container' as const,
          height: 80,
          mark: { type: 'line', interpolate: 'monotone', strokeWidth: 1.5, color: '#f59e0b' },
          encoding: {
            x: { field: 'date', type: 'temporal', title: null, axis: null },
            y: { field: 'rolling_std', type: 'quantitative', title: `σ (${volWindow}d)`, axis: { titlePadding: 16 } },
            tooltip: [
              { field: 'date', type: 'temporal', title: 'Date' },
              { field: 'rolling_std', type: 'quantitative', title: `Std Dev (${volWindow}d)`, format: '.3f' },
            ],
          },
        },
        {
          width: 'container' as const,
          height: 80,
          mark: { type: 'bar' },
          encoding: {
            x: { field: 'date', type: 'temporal', title: null, axis: { labelPadding: 8, labelSeparation: 15 } },
            y: { field: 'volume', type: 'quantitative', title: 'Vol', axis: { format: '~s', titlePadding: 16 } },
            color: {
              field: 'up', type: 'nominal',
              scale: { domain: [true, false], range: ['#22c55e', '#ef4444'] },
              legend: null,
            },
            tooltip: [
              { field: 'date', type: 'temporal', title: 'Date' },
              { field: 'volume', type: 'quantitative', title: 'Volume', format: ',' },
            ],
          },
        },
      ],
      resolve: { scale: { x: 'shared' } },
      spacing: 0,
    };
  }, [prices, volWindow]);

  if (loading) {
    return (
      <Box p={6} textAlign="center">
        <Spinner size="lg" />
        <Text mt={2} color="var(--muted-text)">Loading {symbol}...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={6}>
        <Button variant="ghost" onClick={() => navigate('/investing')} mb={4}>
          <ArrowLeft size={16} /> Back
        </Button>
        <Text color="red.500">{error}</Text>
      </Box>
    );
  }

  const up = (info?.change ?? 0) >= 0;
  const changeColor = up ? 'var(--panel-green-text, #22c55e)' : 'var(--panel-red-text, #ef4444)';

  return (
    <VStack align="stretch" gap={6} p={0}>
      {/* Header */}
      <HStack gap={3}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/investing')}>
          <ArrowLeft size={16} />
        </Button>
        <Box>
          <HStack gap={2} align="baseline">
            <Heading size="xl" color="var(--heading-color)">{symbol}</Heading>
            {info?.asset_type && (
              <Badge variant="outline" fontSize="xs" colorPalette="blue">
                {info.asset_type}
              </Badge>
            )}
          </HStack>
          <Text fontSize="sm" color="var(--muted-text)">{info?.name}</Text>
        </Box>
      </HStack>

      {/* Price header */}
      {info?.latest_price !== null && info?.latest_price !== undefined && (
        <Box>
          <HStack gap={4} align="baseline" flexWrap="wrap">
            <Text fontSize="3xl" fontWeight="bold" color="var(--heading-color)">
              ${info.latest_price.toFixed(2)}
            </Text>
            {info.change !== null && info.change_pct !== null && (
              <HStack gap={1}>
                {up ? <TrendingUp size={18} color={changeColor} /> : <TrendingDown size={18} color={changeColor} />}
                <Text fontSize="lg" fontWeight="semibold" color={changeColor}>
                  {up ? '+' : ''}{info.change.toFixed(2)} ({up ? '+' : ''}{info.change_pct}%)
                </Text>
              </HStack>
            )}
            {info.latest_date && (
              <Text fontSize="sm" color="var(--muted-text)">as of {info.latest_date}</Text>
            )}
          </HStack>

          {/* OHLV row */}
          <Flex gap={6} mt={2} flexWrap="wrap">
            {info.open !== null && (
              <Stat label="Open" value={`$${info.open.toFixed(2)}`} />
            )}
            {info.high !== null && (
              <Stat label="High" value={`$${info.high.toFixed(2)}`} />
            )}
            {info.low !== null && (
              <Stat label="Low" value={`$${info.low.toFixed(2)}`} />
            )}
            {info.volume !== null && (
              <Stat label="Volume" value={formatVolume(info.volume)} />
            )}
          </Flex>
        </Box>
      )}

      {/* Range buttons + volatility window */}
      <HStack gap={3} flexWrap="wrap">
        <HStack gap={1}>
          {(['1M', '3M', '6M', '1Y', 'ALL'] as const).map(r => (
            <Button
              key={r}
              size="xs"
              variant={range === r ? 'solid' : 'ghost'}
              colorPalette={range === r ? 'blue' : undefined}
              onClick={() => setRange(r)}
            >
              {r}
            </Button>
          ))}
        </HStack>
        <HStack gap={1}>
          <Text fontSize="xs" color="var(--muted-text)">σ window:</Text>
          {[2, 5, 10, 20, 50, 100].map(w => (
            <Button
              key={w}
              size="xs"
              variant={volWindow === w ? 'solid' : 'ghost'}
              colorPalette={volWindow === w ? 'orange' : undefined}
              onClick={() => setVolWindow(w)}
            >
              {w}
            </Button>
          ))}
        </HStack>
      </HStack>

      {/* Price + Volume chart */}
      {chartSpec && (
        <VegaProvider>
          <VegaPlot spec={chartSpec} height="400px" />
        </VegaProvider>
      )}

      {/* Quick info panel */}
      <Flex gap={4} flexWrap="wrap">
        {info?.date_range && (
          <InfoCard title="Price History">
            <Text fontSize="sm">{info.total_price_rows} data points</Text>
            <Text fontSize="xs" color="var(--muted-text)">
              {info.date_range.start} to {info.date_range.end}
            </Text>
            <Button
              size="xs"
              variant="outline"
              mt={2}
              disabled={backfilling}
              onClick={async () => {
                setBackfilling(true);
                try {
                  await recipeAPI.request(`/investing/prices/${symbol}/backfill`, { method: 'POST' });
                  fetchInfo();
                  fetchPrices();
                } catch (e) { console.error(e); }
                finally { setBackfilling(false); }
              }}
            >
              <RefreshCw size={12} /> {backfilling ? 'Fetching...' : 'Fetch full history'}
            </Button>
          </InfoCard>
        )}
        {info?.has_options && (
          <InfoCard title="Options">
            <HStack gap={2}>
              <BarChart3 size={16} />
              <Text fontSize="sm">Option chain data available</Text>
            </HStack>
            <Button
              size="xs"
              variant="outline"
              mt={2}
              onClick={() => navigate('/investing', { state: { openOptions: symbol } })}
            >
              View Option Chain
            </Button>
          </InfoCard>
        )}
      </Flex>
    </VStack>
  );
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text fontSize="xs" color="var(--muted-text)">{label}</Text>
      <Text fontSize="sm" fontWeight="semibold">{value}</Text>
    </Box>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box
      p={4}
      bg="var(--card-bg)"
      border="1px solid"
      borderColor="var(--border-color)"
      borderRadius="lg"
      minW="200px"
    >
      <Text fontWeight="bold" fontSize="sm" mb={2} color="var(--heading-color)">{title}</Text>
      {children}
    </Box>
  );
}

export default TickerDetail;
