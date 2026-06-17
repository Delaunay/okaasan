import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Box, Button, Flex, Grid, Heading, HStack, Input, Text, VStack, Spinner,
} from '@chakra-ui/react';
import { RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { VegaProvider } from '../../contexts/VegaContext';
import { recipeAPI } from '../../services/api';
import type { HealthSummary } from '../../services/type';

import HeartRateChart from './charts/HeartRateChart';
import HRVChart from './charts/HRVChart';
import SleepChart from './charts/SleepChart';
import ActivityChart from './charts/ActivityChart';
import CaloriesChart from './charts/CaloriesChart';
import DailySummaryChart from './charts/DailySummaryChart';
import WeeklyOverlayChart from './charts/WeeklyOverlayChart';
import SleepOverlayChart from './charts/SleepOverlayChart';

const METRIC_OPTIONS = [
    { value: 'heart_rate', label: 'Heart Rate' },
    { value: 'hrv', label: 'HRV' },
    { value: 'stress', label: 'Stress' },
    { value: 'body_battery', label: 'Body Battery' },
    { value: 'steps', label: 'Steps' },
    { value: 'respiration', label: 'Respiration' },
];

const RANGE_PRESETS = [
    { label: '1D', days: 1 },
    { label: '1W', days: 7 },
    { label: '1M', days: 30 },
    { label: '1Y', days: 365 },
] as const;

function fmt(d: Date) {
    return d.toISOString().slice(0, 10);
}


const SummaryCard: React.FC<{ label: string; value?: number; unit?: string }> = ({ label, value, unit }) => (
    <Box
        p={4}
        borderRadius="lg"
        border="1px solid"
        borderColor="gray.200"
        minW="130px"
        textAlign="center"
    >
        <Text fontSize="xs" color="gray.500" mb={1}>{label}</Text>
        {value !== undefined ? (
            <Text fontSize="2xl" fontWeight="bold">
                {Number.isInteger(value) ? value : value.toFixed(1)}
                {unit && <Text as="span" fontSize="sm" fontWeight="normal" ml={1}>{unit}</Text>}
            </Text>
        ) : (
            <Text fontSize="sm" color="gray.400">—</Text>
        )}
    </Box>
);

const HealthDashboard: React.FC = () => {
    const today = useMemo(() => new Date(), []);
    const [startDate, setStartDate] = useState(fmt(new Date(today.getTime() - 7 * 86400_000)));
    const [endDate, setEndDate] = useState(fmt(today));
    const [activePreset, setActivePreset] = useState<string>('1W');
    const [summary, setSummary] = useState<HealthSummary | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [overlayMetric, setOverlayMetric] = useState('heart_rate');
    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const navigate = useNavigate();

    const applyPreset = useCallback((days: number, label: string) => {
        const end = new Date();
        const start = new Date(end.getTime() - days * 86400_000);
        setStartDate(fmt(start));
        setEndDate(fmt(end));
        setActivePreset(label);
    }, []);

    const handleStartChange = useCallback((v: string) => { setStartDate(v); setActivePreset(''); }, []);
    const handleEndChange = useCallback((v: string) => { setEndDate(v); setActivePreset(''); }, []);

    const rangeDays = useMemo(() => {
        const s = new Date(startDate);
        const e = new Date(endDate);
        return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400_000));
    }, [startDate, endDate]);

    useEffect(() => {
        setSummaryLoading(true);
        recipeAPI.getHealthSummary()
            .then(setSummary)
            .catch(() => setSummary(null))
            .finally(() => setSummaryLoading(false));
    }, []);

    const handleSync = useCallback(async () => {
        setSyncing(true);
        setSyncStatus(null);
        const end = new Date();
        const start = new Date(end.getTime() - 1 * 86400_000);
        try {
            await recipeAPI.syncGarmin(
                { start: fmt(start), end: fmt(end), dup_threshold: 999999 },
                (evt) => {
                    if (evt.day) setSyncStatus(`Syncing ${evt.day}…`);
                    if (evt.done || evt.stopped) setSyncStatus('Sync complete');
                },
            );
            setRefreshKey(k => k + 1);
            setSummaryLoading(true);
            recipeAPI.getHealthSummary()
                .then(setSummary)
                .catch(() => setSummary(null))
                .finally(() => setSummaryLoading(false));
        } catch {
            setSyncStatus('Sync failed');
        } finally {
            setSyncing(false);
        }
    }, []);

    return (
        <VegaProvider>
            <Box width="100%" maxW="1200px" mx="auto" p={4}>
                <Flex justify="space-between" align="center" mb={4}>
                    <Heading size="lg">Health Dashboard</Heading>
                    <HStack gap={2}>
                        {syncStatus && <Text fontSize="xs" color="gray.500">{syncStatus}</Text>}
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleSync}
                            disabled={syncing}
                        >
                            <RefreshCw size={14} style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} />
                            {syncing ? 'Syncing…' : 'Sync'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => navigate('/health-details')}>
                            More metrics
                        </Button>
                    </HStack>
                </Flex>

                {/* Summary cards */}
                {summaryLoading ? (
                    <Flex justify="center" py={6}><Spinner size="md" /></Flex>
                ) : summary ? (
                    <Flex gap={3} mb={6} flexWrap="wrap">
                        <SummaryCard label="Heart Rate" value={summary.heart_rate?.value} unit="bpm" />
                        <SummaryCard label="HRV" value={summary.hrv?.value} unit="ms" />
                        <SummaryCard label="Stress" value={summary.stress?.value} />
                        <SummaryCard label="Respiration" value={summary.respiration?.value} unit="brpm" />
                        <SummaryCard label="Body Battery" value={summary.body_battery?.value} />
                        <SummaryCard label="Activities" value={summary.activities?.length} />
                    </Flex>
                ) : (
                    <Text fontSize="sm" color="gray.500" mb={6}>
                        No summary data available. Import health data to get started.
                    </Text>
                )}

                {/* Date range controls */}
                <HStack mb={6} gap={3} flexWrap="wrap">
                    <HStack gap={1}>
                        {RANGE_PRESETS.map((p) => (
                            <Button
                                key={p.label}
                                size="xs"
                                variant={activePreset === p.label ? 'solid' : 'outline'}
                                colorPalette={activePreset === p.label ? 'blue' : 'gray'}
                                onClick={() => applyPreset(p.days, p.label)}
                            >
                                {p.label}
                            </Button>
                        ))}
                    </HStack>
                    <HStack gap={1}>
                        <Text fontSize="sm" whiteSpace="nowrap">From</Text>
                        <Input
                            type="date"
                            size="sm"
                            value={startDate}
                            onChange={(e) => handleStartChange(e.target.value)}
                            maxW="160px"
                        />
                    </HStack>
                    <HStack gap={1}>
                        <Text fontSize="sm" whiteSpace="nowrap">To</Text>
                        <Input
                            type="date"
                            size="sm"
                            value={endDate}
                            onChange={(e) => handleEndChange(e.target.value)}
                            maxW="160px"
                        />
                    </HStack>
                </HStack>

                <Box key={refreshKey}>
                {/* Chart grid */}
                <Grid templateColumns={{ base: '1fr', lg: 'repeat(2, 1fr)' }} gap={6} mb={8}>
                    <Box>
                        <Heading size="sm" mb={2}>Heart Rate</Heading>
                        <HeartRateChart start={startDate} end={endDate} />
                    </Box>
                    <Box>
                        <Heading size="sm" mb={2}>Heart Rate Variability</Heading>
                        <HRVChart start={startDate} end={endDate} />
                    </Box>
                    <Box>
                        <Heading size="sm" mb={2}>Sleep</Heading>
                        <SleepChart start={startDate} end={endDate} />
                    </Box>
                    <Box>
                        <Heading size="sm" mb={2}>Activities</Heading>
                        <ActivityChart start={startDate} end={endDate} />
                    </Box>
                    <Box>
                        <Heading size="sm" mb={2}>Calories</Heading>
                        <CaloriesChart start={startDate} end={endDate} />
                    </Box>
                    <Box>
                        <Heading size="sm" mb={2}>Intensity Minutes</Heading>
                        <DailySummaryChart start={startDate} end={endDate} field="intensity_moderate" title="Minutes" color="#ff7f0e" />
                    </Box>
                </Grid>

                {/* Sleep consistency */}
                <VStack align="stretch" gap={4} mb={8}>
                    <Heading size="md">Sleep Consistency</Heading>
                    <SleepOverlayChart start={startDate} end={endDate} />
                </VStack>

                {/* Weekly overlay */}
                <VStack align="stretch" gap={4}>
                    <Heading size="md">Weekly Comparison</Heading>
                    <HStack gap={2} flexWrap="wrap">
                        {METRIC_OPTIONS.map((opt) => (
                            <Box
                                key={opt.value}
                                as="button"
                                px={3}
                                py={1}
                                borderRadius="full"
                                fontSize="sm"
                                cursor="pointer"
                                bg={overlayMetric === opt.value ? 'blue.500' : 'gray.100'}
                                color={overlayMetric === opt.value ? 'white' : 'gray.700'}
                                onClick={() => setOverlayMetric(opt.value)}
                            >
                                {opt.label}
                            </Box>
                        ))}
                    </HStack>
                    <WeeklyOverlayChart metric={overlayMetric} end={endDate} weeks={Math.min(8, Math.max(2, Math.ceil(rangeDays / 7)))} />
                </VStack>
                </Box>
            </Box>
        </VegaProvider>
    );
};

export default HealthDashboard;
