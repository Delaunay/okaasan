import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Flex, Heading, Text, VStack, HStack, Spinner, Badge, Button } from '@chakra-ui/react';
import { ArrowLeft, RefreshCw, Globe } from 'lucide-react';
import { recipeAPI } from '../../services/api';
import VegaPlot from '../health/VegaPlot';
import { VegaProvider } from '../../contexts/VegaContext';

interface Catalog {
  groups: Record<string, Record<string, string>>;
  boc: Record<string, string>;
  metadata: Record<string, string>;
}

interface SeriesPoint {
  date: string;
  value: number | null;
}

type Country = 'us' | 'ca' | 'eu';

const COUNTRY_LABELS: Record<Country, string> = {
  us: 'United States',
  ca: 'Canada',
  eu: 'Europe (Euro Area)',
};

const GDP_SERIES: Record<Country, { total: string; components: Record<string, string> }> = {
  us: {
    total: 'GDP',
    components: {
      'PCEC96': 'Consumption',
      'GPDIC1': 'Investment',
      'GCEC1': 'Government',
      'NETEXC': 'Net Exports',
    },
  },
  ca: {
    total: 'NGDPSAXDCCAQ',
    components: {
      'NAEXKP02CAQ189S': 'Consumption',
      'NAEXKP04CAQ189S': 'Investment',
      'NAEXKP03CAQ189S': 'Government',
    },
  },
  eu: {
    total: 'CLVMNACSCAB1GQEA19',
    components: {
      'NAEXKP02EZQ189S': 'Consumption',
      'NAEXKP04EZQ189S': 'Investment',
      'NAEXKP03EZQ189S': 'Government',
      'NAEXKP01EZQ189S': 'Exports',
      'NAEXKP06EZQ189S': 'Imports',
    },
  },
};

const INDICATOR_PANELS: Record<Country, { title: string; ids: string[]; layout: 'overlay' | 'grid' }[]> = {
  us: [
    { title: 'Interest Rates', ids: ['FEDFUNDS', 'GS2', 'GS10'], layout: 'overlay' },
    { title: 'Yield Curve (10Y-2Y Spread)', ids: ['T10Y2Y'], layout: 'overlay' },
    { title: 'Inflation (CPI)', ids: ['CPIAUCSL'], layout: 'overlay' },
    { title: 'Employment', ids: ['UNRATE', 'ICSA'], layout: 'grid' },
    { title: 'Consumer Sentiment', ids: ['UMCSENT'], layout: 'overlay' },
    { title: 'Industrial Production', ids: ['INDPRO'], layout: 'overlay' },
    { title: 'Money Supply (M2)', ids: ['M2SL'], layout: 'overlay' },
    { title: 'Building Permits', ids: ['PERMIT'], layout: 'overlay' },
  ],
  ca: [
    { title: 'Interest Rates', ids: ['IRSTCB01CAM156N', 'IRLTLT01CAM156N'], layout: 'overlay' },
    { title: 'Inflation (CPI)', ids: ['CANCPIALLMINMEI'], layout: 'overlay' },
    { title: 'Unemployment', ids: ['LRUNTTTTCAM156S'], layout: 'overlay' },
    { title: 'Trade', ids: ['NAEXKP01CAQ189S', 'NAEXKP06CAQ189S'], layout: 'overlay' },
  ],
  eu: [
    { title: 'ECB Interest Rates', ids: ['ECBDFR', 'ECBMRRFR', 'IRLTLT01EZM156N'], layout: 'overlay' },
    { title: 'Inflation (CPI YoY)', ids: ['EA19CPALTT01GYM'], layout: 'overlay' },
    { title: 'Unemployment', ids: ['LRHUTTTTEZM156S'], layout: 'overlay' },
    { title: 'Confidence', ids: ['EA19BSCICP02STSAM', 'EA19CSINFT01STSAM'], layout: 'overlay' },
    { title: 'Industrial Production', ids: ['EA19PRINTO01IXOBSAM'], layout: 'overlay' },
    { title: 'Money Supply (M3)', ids: ['MABMM301EZM189S'], layout: 'overlay' },
    { title: 'Trade', ids: ['NAEXKP01EZQ189S', 'NAEXKP06EZQ189S'], layout: 'overlay' },
  ],
};

function buildOverlaySpec(
  seriesData: Record<string, SeriesPoint[]>,
  ids: string[],
  metadata: Record<string, string>,
  title: string,
) {
  const values: any[] = [];
  for (const id of ids) {
    for (const pt of seriesData[id] || []) {
      if (pt.value !== null) {
        values.push({ date: pt.date, value: pt.value, series: metadata[id] || id });
      }
    }
  }
  if (values.length === 0) return null;

  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container' as const,
    height: 220,
    title: { text: title, anchor: 'start' as const },
    data: { values },
    mark: { type: 'line', interpolate: 'monotone', strokeWidth: 1.5, point: false },
    encoding: {
      x: { field: 'date', type: 'temporal', title: null },
      y: { field: 'value', type: 'quantitative', title: null, scale: { zero: false } },
      color: {
        field: 'series',
        type: 'nominal',
        legend: ids.length > 1 ? { title: null } : null,
      },
      tooltip: [
        { field: 'date', type: 'temporal', title: 'Date' },
        { field: 'series', type: 'nominal', title: 'Series' },
        { field: 'value', type: 'quantitative', title: 'Value', format: ',.2f' },
      ],
    },
  };
}

function buildGDPSpec(
  seriesData: Record<string, SeriesPoint[]>,
  gdpConfig: { total: string; components: Record<string, string> },
  country: string,
) {
  const values: any[] = [];
  for (const [id, label] of Object.entries(gdpConfig.components)) {
    for (const pt of seriesData[id] || []) {
      if (pt.value !== null) {
        values.push({ date: pt.date, value: pt.value, component: label });
      }
    }
  }
  if (values.length === 0) return null;

  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container' as const,
    height: 300,
    title: { text: `${country} GDP Components`, anchor: 'start' as const },
    data: { values },
    mark: { type: 'area', interpolate: 'monotone', opacity: 0.7 },
    encoding: {
      x: { field: 'date', type: 'temporal', title: null },
      y: { field: 'value', type: 'quantitative', title: 'Billions ($)', stack: 'zero' },
      color: {
        field: 'component',
        type: 'nominal',
        scale: { scheme: 'tableau10' },
        legend: { title: null },
      },
      tooltip: [
        { field: 'date', type: 'temporal', title: 'Date' },
        { field: 'component', type: 'nominal', title: 'Component' },
        { field: 'value', type: 'quantitative', title: 'Value', format: ',.1f' },
      ],
    },
  };
}

function buildGDPTotalSpec(
  seriesData: Record<string, SeriesPoint[]>,
  seriesId: string,
  country: string,
) {
  const data = (seriesData[seriesId] || []).filter(p => p.value !== null);
  if (data.length === 0) return null;

  const withGrowth = data.map((p, i) => {
    const prev = i >= 4 ? data[i - 4] : null;
    const yoy = prev && prev.value ? ((p.value! - prev.value) / prev.value) * 100 : null;
    return { date: p.date, value: p.value, yoy_growth: yoy };
  });

  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container' as const,
    height: 220,
    title: { text: `${country} GDP (YoY Growth %)`, anchor: 'start' as const },
    data: { values: withGrowth.filter(d => d.yoy_growth !== null) },
    layer: [
      {
        mark: { type: 'bar', color: '#3b82f6', opacity: 0.7 },
        encoding: {
          x: { field: 'date', type: 'temporal', title: null },
          y: { field: 'yoy_growth', type: 'quantitative', title: 'YoY Growth (%)' },
          color: {
            condition: { test: 'datum.yoy_growth < 0', value: '#ef4444' },
            value: '#3b82f6',
          },
          tooltip: [
            { field: 'date', type: 'temporal', title: 'Date' },
            { field: 'yoy_growth', type: 'quantitative', title: 'YoY Growth %', format: '.2f' },
            { field: 'value', type: 'quantitative', title: 'GDP', format: ',.1f' },
          ],
        },
      },
      {
        mark: { type: 'rule', strokeDash: [4, 2], color: '#94a3b8' },
        encoding: { y: { datum: 0 } },
      },
    ],
  };
}

const EconomicsOverview: React.FC = () => {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [seriesData, setSeriesData] = useState<Record<string, SeriesPoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [country, setCountry] = useState<Country>('us');

  const allNeededIds = useMemo(() => {
    const ids = new Set<string>();
    const gdp = GDP_SERIES[country];
    ids.add(gdp.total);
    Object.keys(gdp.components).forEach(id => ids.add(id));
    for (const panel of INDICATOR_PANELS[country]) {
      panel.ids.forEach(id => ids.add(id));
    }
    return [...ids];
  }, [country]);

  const fetchData = useCallback(async () => {
    try {
      const cat = await recipeAPI.request<Catalog>('/investing/economics/catalog');
      setCatalog(cat);

      if (allNeededIds.length > 0) {
        const multi = await recipeAPI.request<Record<string, SeriesPoint[]>>(
          `/investing/economics/multi?ids=${allNeededIds.join(',')}`
        );
        setSeriesData(multi);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [allNeededIds]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await recipeAPI.request('/investing/economics/refresh', { method: 'POST' });
      await fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  const metadata = catalog?.metadata || {};
  const gdpConfig = GDP_SERIES[country];

  const gdpComponentsSpec = useMemo(
    () => buildGDPSpec(seriesData, gdpConfig, COUNTRY_LABELS[country]),
    [seriesData, gdpConfig, country],
  );

  const gdpGrowthSpec = useMemo(
    () => buildGDPTotalSpec(seriesData, gdpConfig.total, COUNTRY_LABELS[country]),
    [seriesData, gdpConfig.total, country],
  );

  const indicatorSpecs = useMemo(
    () => INDICATOR_PANELS[country].map(panel => ({
      ...panel,
      spec: panel.layout === 'overlay'
        ? buildOverlaySpec(seriesData, panel.ids, metadata, panel.title)
        : null,
      gridSpecs: panel.layout === 'grid'
        ? panel.ids.map(id => ({
            id,
            spec: buildOverlaySpec(seriesData, [id], metadata, metadata[id] || id),
          }))
        : null,
    })),
    [seriesData, metadata, country],
  );

  const hasData = Object.values(seriesData).some(arr => arr.length > 0);

  if (loading) {
    return (
      <Box p={6} textAlign="center">
        <Spinner size="lg" />
        <Text mt={2} color="var(--muted-text)">Loading economic data...</Text>
      </Box>
    );
  }

  return (
    <VStack align="stretch" gap={6} p={0}>
      {/* Header */}
      <HStack gap={3} justify="space-between" flexWrap="wrap">
        <HStack gap={3}>
          <Button variant="ghost" size="sm" onClick={() => navigate('/investing')}>
            <ArrowLeft size={16} />
          </Button>
          <Globe size={24} color="var(--icon-color)" />
          <Heading size="xl" color="var(--heading-color)">Economic Indicators</Heading>
        </HStack>
        <HStack gap={2}>
          {([['us', 'US'], ['ca', 'Canada'], ['eu', 'Europe']] as [Country, string][]).map(([c, label]) => (
            <Button
              key={c}
              size="sm"
              variant={country === c ? 'solid' : 'outline'}
              colorPalette={country === c ? 'blue' : undefined}
              onClick={() => setCountry(c)}
            >
              {label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? <Spinner size="xs" /> : <RefreshCw size={14} />}
            <Text ml={1}>{refreshing ? 'Fetching...' : 'Refresh Data'}</Text>
          </Button>
        </HStack>
      </HStack>

      {!hasData && (
        <Box
          p={6}
          bg="var(--card-bg)"
          border="1px solid"
          borderColor="var(--border-color)"
          borderRadius="lg"
          textAlign="center"
        >
          <Text fontSize="md" fontWeight="semibold" mb={2}>No economic data cached yet</Text>
          <Text fontSize="sm" color="var(--muted-text)" mb={4}>
            Configure your FRED API key in Investing Settings, then click "Refresh Data" to fetch indicators.
          </Text>
          <HStack justify="center" gap={3}>
            <Button size="sm" variant="outline" onClick={() => navigate('/settings/investing')}>
              Go to Settings
            </Button>
            <Button size="sm" colorPalette="blue" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? <Spinner size="xs" /> : <RefreshCw size={14} />}
              <Text ml={1}>Refresh Data</Text>
            </Button>
          </HStack>
        </Box>
      )}

      {hasData && (
        <>
          {/* GDP section */}
          <Box>
            <Heading size="md" color="var(--heading-color)" mb={3}>
              GDP — {COUNTRY_LABELS[country]}
            </Heading>
            <Flex gap={4} direction={{ base: 'column', lg: 'row' }}>
              {gdpGrowthSpec && (
                <Box flex={1}>
                  <VegaProvider>
                    <VegaPlot spec={gdpGrowthSpec} height="240px" />
                  </VegaProvider>
                </Box>
              )}
              {gdpComponentsSpec && (
                <Box flex={1}>
                  <VegaProvider>
                    <VegaPlot spec={gdpComponentsSpec} height="320px" />
                  </VegaProvider>
                </Box>
              )}
            </Flex>
          </Box>

          {/* Indicator panels */}
          <Box>
            <Heading size="md" color="var(--heading-color)" mb={3}>
              Key Indicators
            </Heading>
            <Flex gap={4} flexWrap="wrap">
              {indicatorSpecs.map((panel, i) => (
                <Box
                  key={i}
                  flex="1 1 calc(50% - 8px)"
                  minW="320px"
                  bg="var(--card-bg)"
                  border="1px solid"
                  borderColor="var(--border-color)"
                  borderRadius="lg"
                  p={3}
                >
                  {panel.spec && (
                    <VegaProvider>
                      <VegaPlot spec={panel.spec} height="240px" />
                    </VegaProvider>
                  )}
                  {panel.gridSpecs && panel.gridSpecs.map(gs => (
                    gs.spec && (
                      <Box key={gs.id} mb={2}>
                        <VegaProvider>
                          <VegaPlot spec={gs.spec} height="200px" />
                        </VegaProvider>
                      </Box>
                    )
                  ))}
                  {!panel.spec && !panel.gridSpecs?.some(gs => gs.spec) && (
                    <Text fontSize="sm" color="var(--muted-text)" p={4} textAlign="center">
                      No data for {panel.title}
                    </Text>
                  )}
                </Box>
              ))}
            </Flex>
          </Box>

          {/* Data info */}
          <HStack gap={2} flexWrap="wrap">
            {allNeededIds.map(id => {
              const count = (seriesData[id] || []).length;
              return (
                <Badge key={id} variant="outline" fontSize="2xs" colorPalette={count > 0 ? 'green' : 'gray'}>
                  {metadata[id] || id}: {count}
                </Badge>
              );
            })}
          </HStack>
        </>
      )}
    </VStack>
  );
};

export default EconomicsOverview;
