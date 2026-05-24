import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Box, Flex, Grid, Heading, Text, VStack, HStack, Spinner, Badge, Button, Input } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, RefreshCw, Plus, Settings, BarChart3, DollarSign } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import VegaPlot from '../health/VegaPlot';
import { VegaProvider } from '../../contexts/VegaContext';

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
  underlying_price: number | null;
}

interface OverviewData {
  watchlist: WatchlistEntry[];
  option_summary: OptionSummary[];
}

interface OptionContract {
  symbol: string;
  expiration: string;
  days_to_expiration: number | null;
  strike: number;
  option_type: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume: number | null;
  open_interest: number | null;
  implied_volatility: number | null;
}

interface Sentiment {
  pcr_oi: number | null;
  pcr_volume: number | null;
  pcr_dollar: number | null;
  total_call_oi: number;
  total_put_oi: number;
  total_call_volume: number;
  total_put_volume: number;
  total_call_dollar: number;
  total_put_dollar: number;
}

interface MaxPain {
  strike: number;
  value: number;
}

interface OIByStrike {
  strike: number;
  call_oi: number;
  put_oi: number;
}

interface VolOIFlag {
  strike: number;
  option_type: string;
  volume: number;
  open_interest: number;
  vol_oi_ratio: number;
  expiration: string;
  dte: number | null;
}

interface IVTermPoint {
  expiration: string;
  dte: number | null;
  atm_iv: number;
  type: string;
}

interface IVSkew {
  expiration: string;
  dte: number | null;
  skew: number;
  otm_put_strike: number;
  otm_put_iv: number;
  otm_call_strike: number;
  otm_call_iv: number;
}

interface Analytics {
  oi_by_strike: OIByStrike[];
  vol_oi_flags: VolOIFlag[];
  iv_term_structure: IVTermPoint[];
  iv_skew_by_expiration: IVSkew[];
}

interface OptionChainData {
  symbol: string;
  snapshot_date: string | null;
  underlying_price: number | null;
  expirations: string[];
  total_contracts: number;
  sentiment: Sentiment;
  sentiment_by_expiration: Record<string, Sentiment>;
  max_pain_by_expiration: Record<string, MaxPain | null>;
  analytics: Analytics;
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

function formatCompact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function pcrColor(pcr: number | null): string {
  if (pcr == null) return 'var(--muted-text)';
  if (pcr < 0.7) return 'var(--panel-green-text, #22c55e)';
  if (pcr > 1.0) return 'var(--panel-red-text, #ef4444)';
  return 'var(--panel-orange-text, #f59e0b)';
}

function pcrLabel(pcr: number | null): string {
  if (pcr == null) return 'N/A';
  if (pcr < 0.7) return 'Bullish';
  if (pcr > 1.0) return 'Bearish';
  return 'Neutral';
}

function SentimentPanel({ sentiment }: { sentiment: Sentiment }) {
  const cards: { title: string; pcr: number | null; callLabel: string; putLabel: string }[] = [
    {
      title: 'PCR (Open Interest)',
      pcr: sentiment.pcr_oi,
      callLabel: `Calls: ${formatCompact(sentiment.total_call_oi)}`,
      putLabel: `Puts: ${formatCompact(sentiment.total_put_oi)}`,
    },
    {
      title: 'PCR (Volume)',
      pcr: sentiment.pcr_volume,
      callLabel: `Calls: ${formatCompact(sentiment.total_call_volume)}`,
      putLabel: `Puts: ${formatCompact(sentiment.total_put_volume)}`,
    },
    {
      title: 'PCR (Dollar-weighted)',
      pcr: sentiment.pcr_dollar,
      callLabel: `Calls: $${formatCompact(sentiment.total_call_dollar)}`,
      putLabel: `Puts: $${formatCompact(sentiment.total_put_dollar)}`,
    },
  ];

  return (
    <Grid templateColumns="repeat(3, 1fr)" gap={3} mb={2}>
      {cards.map(c => (
        <Box
          key={c.title}
          p={3}
          bg="var(--card-bg)"
          border="1px solid"
          borderColor="var(--border-color)"
          borderRadius="lg"
        >
          <Text fontSize="xs" color="var(--muted-text)" mb={1}>{c.title}</Text>
          <HStack gap={2} mb={1}>
            <Text fontSize="xl" fontWeight="bold" color={pcrColor(c.pcr)}>
              {c.pcr != null ? c.pcr.toFixed(2) : '-'}
            </Text>
            <Badge
              fontSize="2xs"
              colorPalette={c.pcr == null ? 'gray' : c.pcr < 0.7 ? 'green' : c.pcr > 1.0 ? 'red' : 'orange'}
            >
              {pcrLabel(c.pcr)}
            </Badge>
          </HStack>
          <Text fontSize="2xs" color="var(--muted-text)">{c.callLabel} / {c.putLabel}</Text>
        </Box>
      ))}
    </Grid>
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

  const filteredContracts = optionChain?.contracts.filter(
    c => !selectedExpiration || c.expiration === selectedExpiration
  ) || [];

  const calls = filteredContracts.filter(c => c.option_type === 'call');
  const puts = filteredContracts.filter(c => c.option_type === 'put');

  const smileSpec = useMemo(() => {
    if (!optionChain || optionChain.contracts.length === 0) return null;

    const rows = optionChain.contracts
      .filter(c => c.implied_volatility != null && c.implied_volatility > 0.001)
      .map(c => {
        const dte = c.days_to_expiration ?? Math.round(
          (new Date(c.expiration).getTime() - new Date(optionChain.snapshot_date || Date.now()).getTime())
          / 86400000
        );
        return {
          strike: c.strike,
          iv: +(c.implied_volatility! * 100).toFixed(2),
          dte,
          dte_label: `${dte}d`,
          expiration: c.expiration,
          type: c.option_type,
        };
      });

    if (rows.length === 0) return null;

    const legendSel = {
      name: 'legendFilter',
      select: { type: 'point', fields: ['dte_label'] },
      bind: 'legend',
    };
    const brushSel = {
      name: 'brush',
      select: { type: 'interval', encodings: ['x'] },
    };

    const opacityCondition = {
      condition: { param: 'legendFilter', value: 0.85 },
      value: 0.08,
    };

    const layers: any[] = [
      {
        params: [legendSel, brushSel],
        mark: { type: 'line', interpolate: 'monotone', strokeWidth: 2 },
        encoding: {
          x: {
            field: 'strike', type: 'quantitative', title: 'Strike Price',
            scale: { domain: { param: 'brush' } },
          },
          y: { field: 'iv', type: 'quantitative', title: 'Implied Volatility (%)' },
          color: {
            field: 'dte_label', type: 'nominal', title: 'DTE',
            sort: { field: 'dte', op: 'min' },
          },
          strokeDash: {
            field: 'type', type: 'nominal', title: 'Type',
            scale: { domain: ['call', 'put'], range: [[1, 0], [4, 4]] },
          },
          opacity: opacityCondition,
        },
      },
      {
        mark: { type: 'circle', size: 24 },
        encoding: {
          x: { field: 'strike', type: 'quantitative' },
          y: { field: 'iv', type: 'quantitative' },
          color: { field: 'dte_label', type: 'nominal', sort: { field: 'dte', op: 'min' } },
          opacity: opacityCondition,
          tooltip: [
            { field: 'dte_label', type: 'nominal', title: 'DTE' },
            { field: 'expiration', type: 'nominal', title: 'Expiration' },
            { field: 'type', type: 'nominal', title: 'Type' },
            { field: 'strike', type: 'quantitative', title: 'Strike', format: '.2f' },
            { field: 'iv', type: 'quantitative', title: 'IV (%)', format: '.1f' },
          ],
        },
      },
    ];

    if (optionChain.underlying_price != null) {
      layers.push({
        mark: { type: 'rule', strokeDash: [6, 4], strokeWidth: 1.5 },
        encoding: {
          x: { datum: optionChain.underlying_price },
          color: { value: 'var(--icon-color, #6366f1)' },
        },
      });
      layers.push({
        mark: { type: 'text', align: 'left', dx: 4, dy: -8, fontSize: 11 },
        encoding: {
          x: { datum: optionChain.underlying_price },
          text: { value: `Spot $${optionChain.underlying_price.toFixed(2)}` },
          color: { value: 'var(--muted-text, #888)' },
        },
      });
    }

    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container',
      height: 280,
      autosize: { type: 'fit', contains: 'padding' },
      data: { values: rows },
      layer: layers,
    };
  }, [optionChain]);

  const pcrSpec = useMemo(() => {
    if (!optionChain?.sentiment_by_expiration) return null;

    const rows: { dte: number; dte_label: string; metric: string; value: number }[] = [];
    for (const [exp, s] of Object.entries(optionChain.sentiment_by_expiration)) {
      const contract = optionChain.contracts.find(c => c.expiration === exp);
      const dte = contract?.days_to_expiration ?? Math.round(
        (new Date(exp).getTime() - new Date(optionChain.snapshot_date || Date.now()).getTime()) / 86400000
      );
      if (s.pcr_oi != null) rows.push({ dte, dte_label: `${dte}d`, metric: 'Open Interest', value: s.pcr_oi });
      if (s.pcr_volume != null) rows.push({ dte, dte_label: `${dte}d`, metric: 'Volume', value: s.pcr_volume });
      if (s.pcr_dollar != null) rows.push({ dte, dte_label: `${dte}d`, metric: 'Dollar-weighted', value: s.pcr_dollar });
    }

    if (rows.length === 0) return null;

    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      autosize: { type: 'fit', contains: 'padding' },
      data: { values: rows },
      columns: 3,
      facet: { field: 'metric', type: 'nominal', title: null },
      resolve: { scale: { y: 'independent' } },
      spec: {
        width: 620,
        height: 150,
        layer: [
          {
            mark: { type: 'line', interpolate: 'monotone', strokeWidth: 2, point: true },
            encoding: {
              x: { field: 'dte', type: 'quantitative', title: 'DTE', sort: 'ascending' },
              y: { field: 'value', type: 'quantitative', title: 'PCR', scale: { zero: false } },
              color: { field: 'metric', type: 'nominal', legend: null },
              tooltip: [
                { field: 'dte_label', type: 'nominal', title: 'DTE' },
                { field: 'metric', type: 'nominal', title: 'Metric' },
                { field: 'value', type: 'quantitative', title: 'PCR', format: '.2f' },
              ],
            },
          },
          {
            mark: { type: 'rule', strokeDash: [4, 4], strokeWidth: 1 },
            encoding: {
              y: { datum: 1.0 },
              color: { value: 'var(--muted-text, #888)' },
            },
          },
        ],
      },
    };
  }, [optionChain]);

  const oiWallsSpec = useMemo(() => {
    if (!optionChain?.analytics?.oi_by_strike?.length) return null;
    const data = optionChain.analytics.oi_by_strike
      .filter(d => d.call_oi > 0 || d.put_oi > 0)
      .flatMap(d => [
        { strike: d.strike, oi: d.call_oi, type: 'Call' },
        { strike: d.strike, oi: -d.put_oi, type: 'Put' },
      ]);
    if (data.length === 0) return null;

    const layers: any[] = [
      {
        mark: { type: 'bar', opacity: 0.8 },
        encoding: {
          x: { field: 'strike', type: 'quantitative', title: 'Strike Price', axis: { labelAngle: -45 } },
          y: { field: 'oi', type: 'quantitative', title: 'Open Interest (Puts negative)' },
          color: {
            field: 'type', type: 'nominal', title: 'Side',
            scale: { domain: ['Call', 'Put'], range: ['#22c55e', '#ef4444'] },
          },
          tooltip: [
            { field: 'strike', type: 'quantitative', title: 'Strike', format: '.2f' },
            { field: 'type', type: 'nominal', title: 'Type' },
            { field: 'oi', type: 'quantitative', title: 'OI' },
          ],
        },
      },
    ];
    if (optionChain.underlying_price != null) {
      layers.push({
        mark: { type: 'rule', strokeDash: [6, 4], strokeWidth: 1.5 },
        encoding: { x: { datum: optionChain.underlying_price }, color: { value: 'var(--icon-color, #6366f1)' } },
      });
    }
    const mp = selectedExpiration
      ? optionChain.max_pain_by_expiration?.[selectedExpiration]
      : Object.values(optionChain.max_pain_by_expiration || {}).find(Boolean);
    if (mp) {
      layers.push({
        mark: { type: 'rule', strokeDash: [2, 2], strokeWidth: 2 },
        encoding: { x: { datum: mp.strike }, color: { value: '#f59e0b' } },
      });
      layers.push({
        mark: { type: 'text', align: 'left', dx: 4, dy: -8, fontSize: 11 },
        encoding: {
          x: { datum: mp.strike },
          text: { value: `Max Pain $${mp.strike}` },
          color: { value: '#f59e0b' },
        },
      });
    }
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container', height: 260,
      autosize: { type: 'fit', contains: 'padding' },
      data: { values: data },
      layer: layers,
    };
  }, [optionChain, selectedExpiration]);

  const volOiSpec = useMemo(() => {
    if (!optionChain?.analytics?.vol_oi_flags?.length) return null;
    const top = optionChain.analytics.vol_oi_flags.slice(0, 30);
    if (top.length === 0) return null;
    const data = top.map(d => ({
      label: `${d.strike} ${d.option_type[0].toUpperCase()} ${d.dte ?? ''}d`,
      strike: d.strike,
      type: d.option_type === 'call' ? 'Call' : 'Put',
      vol_oi_ratio: d.vol_oi_ratio,
      volume: d.volume,
      open_interest: d.open_interest,
      dte: d.dte,
    }));
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container', height: 240,
      autosize: { type: 'fit', contains: 'padding' },
      data: { values: data },
      layer: [
        {
          mark: { type: 'bar', opacity: 0.85 },
          encoding: {
            y: { field: 'label', type: 'nominal', title: null, sort: { field: 'vol_oi_ratio', order: 'descending' } },
            x: { field: 'vol_oi_ratio', type: 'quantitative', title: 'Volume / Open Interest' },
            color: {
              field: 'type', type: 'nominal', title: 'Side',
              scale: { domain: ['Call', 'Put'], range: ['#22c55e', '#ef4444'] },
            },
            tooltip: [
              { field: 'strike', type: 'quantitative', title: 'Strike' },
              { field: 'type', type: 'nominal', title: 'Type' },
              { field: 'volume', type: 'quantitative', title: 'Volume' },
              { field: 'open_interest', type: 'quantitative', title: 'OI' },
              { field: 'vol_oi_ratio', type: 'quantitative', title: 'Vol/OI', format: '.2f' },
              { field: 'dte', type: 'quantitative', title: 'DTE' },
            ],
          },
        },
        {
          mark: { type: 'rule', strokeDash: [4, 4], strokeWidth: 1 },
          encoding: { x: { datum: 1.0 }, color: { value: 'var(--muted-text, #888)' } },
        },
      ],
    };
  }, [optionChain]);

  const ivTermSpec = useMemo(() => {
    if (!optionChain?.analytics?.iv_term_structure?.length) return null;
    const data = optionChain.analytics.iv_term_structure
      .filter(d => d.dte != null && d.dte >= 0)
      .map(d => ({ ...d, dte_label: `${d.dte}d`, type_label: d.type === 'call' ? 'Call ATM' : 'Put ATM' }));
    if (data.length === 0) return null;
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container', height: 220,
      autosize: { type: 'fit', contains: 'padding' },
      data: { values: data },
      mark: { type: 'line', interpolate: 'monotone', strokeWidth: 2, point: true },
      encoding: {
        x: { field: 'dte', type: 'quantitative', title: 'Days to Expiration', sort: 'ascending' },
        y: { field: 'atm_iv', type: 'quantitative', title: 'ATM Implied Volatility (%)', scale: { zero: false } },
        color: {
          field: 'type_label', type: 'nominal', title: 'Type',
          scale: { domain: ['Call ATM', 'Put ATM'], range: ['#22c55e', '#ef4444'] },
        },
        tooltip: [
          { field: 'dte_label', type: 'nominal', title: 'DTE' },
          { field: 'expiration', type: 'nominal', title: 'Expiration' },
          { field: 'type_label', type: 'nominal', title: 'Type' },
          { field: 'atm_iv', type: 'quantitative', title: 'ATM IV (%)', format: '.1f' },
        ],
      },
    };
  }, [optionChain]);

  const ivSkewSpec = useMemo(() => {
    if (!optionChain?.analytics?.iv_skew_by_expiration?.length) return null;
    const data = optionChain.analytics.iv_skew_by_expiration
      .filter(d => d.dte != null && d.dte >= 0)
      .map(d => ({ ...d, dte_label: `${d.dte}d` }));
    if (data.length === 0) return null;
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container', height: 220,
      autosize: { type: 'fit', contains: 'padding' },
      data: { values: data },
      layer: [
        {
          mark: { type: 'bar', opacity: 0.8 },
          encoding: {
            x: { field: 'dte', type: 'ordinal', title: 'Days to Expiration', sort: 'ascending' },
            y: { field: 'skew', type: 'quantitative', title: 'IV Skew (Put IV - Call IV, %)' },
            color: {
              condition: { test: 'datum.skew >= 0', value: '#ef4444' },
              value: '#22c55e',
            },
            tooltip: [
              { field: 'dte_label', type: 'nominal', title: 'DTE' },
              { field: 'expiration', type: 'nominal', title: 'Expiration' },
              { field: 'skew', type: 'quantitative', title: 'Skew (%)', format: '.2f' },
              { field: 'otm_put_strike', type: 'quantitative', title: 'OTM Put Strike' },
              { field: 'otm_put_iv', type: 'quantitative', title: 'OTM Put IV (%)', format: '.1f' },
              { field: 'otm_call_strike', type: 'quantitative', title: 'OTM Call Strike' },
              { field: 'otm_call_iv', type: 'quantitative', title: 'OTM Call IV (%)', format: '.1f' },
            ],
          },
        },
        {
          mark: { type: 'rule', strokeDash: [4, 4], strokeWidth: 1 },
          encoding: { y: { datum: 0 }, color: { value: 'var(--muted-text, #888)' } },
        },
      ],
    };
  }, [optionChain]);

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
                cursor="pointer"
                _hover={{ borderColor: 'var(--icon-color)', bg: 'var(--hover-bg)' }}
                onClick={() => navigate(`/investing/${w.symbol}`)}
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
                    {o.underlying_price != null && (
                      <Text fontSize="sm" color="var(--muted-text)">${o.underlying_price.toFixed(2)}</Text>
                    )}
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
            <HStack gap={3}>
              <Heading size="md" color="var(--heading-color)">{optionChain.symbol} Options</Heading>
              {optionChain.underlying_price != null && (
                <Text fontSize="md" fontWeight="semibold" color="var(--muted-text)">
                  Underlying: ${optionChain.underlying_price.toFixed(2)}
                </Text>
              )}
            </HStack>
            <HStack gap={1} flexWrap="wrap">
              {optionChain.expirations.map(exp => {
                const dteForExp = optionChain.contracts.find(c => c.expiration === exp)?.days_to_expiration;
                const dteStr = dteForExp != null ? ` (${dteForExp}d)` : '';
                return (
                  <Button
                    key={exp}
                    size="xs"
                    variant={selectedExpiration === exp ? 'solid' : 'outline'}
                    colorPalette={selectedExpiration === exp ? 'blue' : 'gray'}
                    onClick={() => setSelectedExpiration(exp)}
                  >
                    {exp}{dteStr}
                  </Button>
                );
              })}
            </HStack>
          </HStack>

          {optionChain.sentiment && (() => {
            const expSentiment = selectedExpiration && optionChain.sentiment_by_expiration?.[selectedExpiration];
            const activeSentiment = expSentiment || optionChain.sentiment;
            const dteForSelected = selectedExpiration
              ? optionChain.contracts.find(c => c.expiration === selectedExpiration)?.days_to_expiration
              : null;
            const label = expSentiment
              ? `${selectedExpiration}${dteForSelected != null ? ` (${dteForSelected}d)` : ''}`
              : 'All Expirations';
            return (
              <Box>
                <Text fontSize="xs" color="var(--muted-text)" mb={1}>Sentiment: {label}</Text>
                <SentimentPanel sentiment={activeSentiment} />
              </Box>
            );
          })()}

          {pcrSpec && (
            <Box
              p={3}
              bg="var(--card-bg)"
              border="1px solid"
              borderColor="var(--border-color)"
              borderRadius="lg"
              mb={2}
            >
              <Text fontSize="sm" fontWeight="semibold" mb={2} color="var(--heading-color)">
                Put/Call Ratio by Maturity
              </Text>
              <VegaProvider>
                <VegaPlot spec={pcrSpec} height="220px" />
              </VegaProvider>
            </Box>
          )}

          {smileSpec && (
            <Box
              p={3}
              bg="var(--card-bg)"
              border="1px solid"
              borderColor="var(--border-color)"
              borderRadius="lg"
              mb={2}
            >
              <Text fontSize="sm" fontWeight="semibold" mb={2} color="var(--heading-color)">
                Volatility Smile
              </Text>
              <VegaProvider>
                <VegaPlot spec={smileSpec} height="280px" />
              </VegaProvider>
            </Box>
          )}

          {oiWallsSpec && (
            <Box p={3} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" mb={2}>
              <Text fontSize="sm" fontWeight="semibold" mb={1} color="var(--heading-color)">
                Open Interest by Strike
              </Text>
              <Text fontSize="2xs" color="var(--muted-text)" mb={2}>
                Large OI clusters act as support/resistance. The yellow line marks Max Pain — the strike where most options expire worthless.
              </Text>
              <VegaProvider>
                <VegaPlot spec={oiWallsSpec} height="260px" />
              </VegaProvider>
            </Box>
          )}

          <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={3} mb={2}>
            {ivTermSpec && (
              <Box p={3} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
                <Text fontSize="sm" fontWeight="semibold" mb={1} color="var(--heading-color)">
                  IV Term Structure
                </Text>
                <Text fontSize="2xs" color="var(--muted-text)" mb={2}>
                  ATM IV across expirations. Downward slope (backwardation) signals near-term fear; upward slope (contango) is normal/calm.
                </Text>
                <VegaProvider>
                  <VegaPlot spec={ivTermSpec} height="220px" />
                </VegaProvider>
              </Box>
            )}
            {ivSkewSpec && (
              <Box p={3} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
                <Text fontSize="sm" fontWeight="semibold" mb={1} color="var(--heading-color)">
                  IV Skew by Maturity
                </Text>
                <Text fontSize="2xs" color="var(--muted-text)" mb={2}>
                  OTM put IV minus OTM call IV (~5% from spot). Positive (red) = demand for downside protection; negative (green) = call demand dominates.
                </Text>
                <VegaProvider>
                  <VegaPlot spec={ivSkewSpec} height="220px" />
                </VegaProvider>
              </Box>
            )}
          </Grid>

          {volOiSpec && (
            <Box p={3} bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" mb={2}>
              <Text fontSize="sm" fontWeight="semibold" mb={1} color="var(--heading-color)">
                Unusual Activity (Volume / OI)
              </Text>
              <Text fontSize="2xs" color="var(--muted-text)" mb={2}>
                Top contracts by volume relative to open interest. Ratio above 1 (dashed line) suggests new positions being opened — potential smart money signal.
              </Text>
              <VegaProvider>
                <VegaPlot spec={volOiSpec} height="240px" />
              </VegaProvider>
            </Box>
          )}

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
                    {calls.map((c, i) => (
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
                    {puts.map((c, i) => (
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
