import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Grid, Heading, HStack, Text, VStack, Spinner, Button, Input } from '@chakra-ui/react';
import { VegaProvider } from '../../contexts/VegaContext';
import VegaPlot from './VegaPlot';
import { healthDataUrl, endOfDay } from '../../services/api';

interface Activity {
    id: number;
    date: string;
    type: string;
    duration_min: number;
    distance_km: number;
    speed_kmh: number | null;
    calories: number | null;
    avg_hr: number | null;
    max_hr: number | null;
    min_hr: number | null;
}

const RANGE_PRESETS = [
    { label: '1M', days: 30 },
    { label: '3M', days: 90 },
    { label: '6M', days: 180 },
    { label: '1Y', days: 365 },
    { label: 'All', days: 365 * 3 },
];

const KNOWN_COLORS: Record<string, string> = {
    running: '#e45756',
    cycling: '#ff7f0e',
    lap_swimming: '#17becf',
    badminton: '#4c78a8',
    yoga: '#54a24b',
    walking: '#8c564b',
    hiking: '#2ca02c',
    strength_training: '#d62728',
    other: '#9467bd',
};

const FALLBACK_PALETTE = [
    '#17becf', '#bcbd22', '#7f7f7f', '#e377c2', '#f7b6d2',
    '#c5b0d5', '#aec7e8', '#ffbb78', '#98df8a', '#ff9896',
];

function buildColorScale(types: string[]): { domain: string[]; range: string[] } {
    const domain: string[] = [];
    const range: string[] = [];
    let fallbackIdx = 0;
    for (const t of types) {
        domain.push(t);
        if (KNOWN_COLORS[t]) {
            range.push(KNOWN_COLORS[t]);
        } else {
            range.push(FALLBACK_PALETTE[fallbackIdx % FALLBACK_PALETTE.length]);
            fallbackIdx++;
        }
    }
    return { domain, range };
}

function fmt(d: Date): string {
    return d.toISOString().slice(0, 10);
}

const PAGE_SIZE = 20;

const HealthActivities: React.FC = () => {
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);

    const today = useMemo(() => new Date(), []);
    const [startDate, setStartDate] = useState(() => fmt(new Date(today.getTime() - 365 * 86400000)));
    const [endDate, setEndDate] = useState(() => fmt(today));

    const setRange = useCallback((days: number) => {
        const e = new Date();
        const s = new Date(e.getTime() - days * 86400000);
        setStartDate(fmt(s));
        setEndDate(fmt(e));
    }, []);

    useEffect(() => {
        setLoading(true);
        fetch(healthDataUrl('activities-detail', { start: startDate, end: endDate }))
            .then(r => r.json())
            .then(data => { setActivities(data); setPage(0); setLoading(false); })
            .catch(() => setLoading(false));
    }, [startDate, endDate]);

    const activityTypes = useMemo(() => {
        const types = new Set(activities.map(a => a.type));
        return Array.from(types).sort();
    }, [activities]);

    const colorScale = useMemo(() => buildColorScale(activityTypes), [activityTypes]);

    const summaryByType = useMemo(() => {
        const map: Record<string, { count: number; totalMin: number; totalDist: number; totalCal: number }> = {};
        for (const a of activities) {
            if (!map[a.type]) map[a.type] = { count: 0, totalMin: 0, totalDist: 0, totalCal: 0 };
            map[a.type].count++;
            map[a.type].totalMin += a.duration_min;
            map[a.type].totalDist += a.distance_km;
            map[a.type].totalCal += a.calories || 0;
        }
        return map;
    }, [activities]);

    const durationProgressSpec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('activities-detail', { start: startDate, end: endDate }) },
        mark: { type: 'point', filled: true, size: 80, opacity: 0.8 },
        encoding: {
            x: { field: 'date', type: 'temporal', title: null, scale: { type: 'time', domain: [startDate, endOfDay(endDate)] } },
            y: { field: 'duration_min', type: 'quantitative', title: 'Duration (min)' },
            color: { field: 'type', type: 'nominal', legend: null, scale: colorScale },
            tooltip: [
                { field: 'date', type: 'temporal', title: 'Date' },
                { field: 'type', title: 'Activity' },
                { field: 'duration_min', type: 'quantitative', title: 'Minutes', format: '.0f' },
            ],
        },
    }), [startDate, endDate, colorScale]);

    const distanceProgressSpec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('activities-detail', { start: startDate, end: endDate }) },
        transform: [{ filter: 'datum.distance_km > 0' }],
        mark: { type: 'point', filled: true, size: 80, opacity: 0.8 },
        encoding: {
            x: { field: 'date', type: 'temporal', title: null, scale: { type: 'time', domain: [startDate, endOfDay(endDate)] } },
            y: { field: 'distance_km', type: 'quantitative', title: 'Distance (km)' },
            color: { field: 'type', type: 'nominal', legend: null, scale: colorScale },
            tooltip: [
                { field: 'date', type: 'temporal', title: 'Date' },
                { field: 'type', title: 'Activity' },
                { field: 'distance_km', type: 'quantitative', title: 'km', format: '.1f' },
            ],
        },
    }), [startDate, endDate, colorScale]);

    const caloriesProgressSpec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('activities-detail', { start: startDate, end: endDate }) },
        transform: [{ filter: 'datum.calories > 0' }],
        mark: { type: 'bar', opacity: 0.7 },
        encoding: {
            x: { field: 'date', type: 'temporal', title: null, scale: { type: 'time', domain: [startDate, endOfDay(endDate)] } },
            y: { field: 'calories', type: 'quantitative', title: 'Calories', stack: true },
            color: { field: 'type', type: 'nominal', legend: null, scale: colorScale },
            tooltip: [
                { field: 'date', type: 'temporal', title: 'Date' },
                { field: 'type', title: 'Activity' },
                { field: 'calories', type: 'quantitative', title: 'kcal' },
            ],
        },
    }), [startDate, endDate, colorScale]);

    const weeklyFreqSpec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('activities-detail', { start: startDate, end: endDate }) },
        transform: [
            { timeUnit: 'yearweek', field: 'date', as: 'week' },
            { aggregate: [{ op: 'count', as: 'sessions' }], groupby: ['week', 'type'] },
        ],
        mark: { type: 'bar', opacity: 0.7 },
        encoding: {
            x: { field: 'week', type: 'temporal', title: null },
            y: { field: 'sessions', type: 'quantitative', title: 'Sessions / Week', stack: true },
            color: { field: 'type', type: 'nominal', legend: { title: null }, scale: colorScale },
            tooltip: [
                { field: 'week', type: 'temporal', title: 'Week' },
                { field: 'type', title: 'Activity' },
                { field: 'sessions', type: 'quantitative', title: 'Sessions' },
            ],
        },
    }), [startDate, endDate, colorScale]);

    const colorEnc = { field: 'type', type: 'nominal' as const, legend: null, scale: colorScale };
    const xEnc = { field: 'date', type: 'temporal' as const, title: null, axis: { tickCount: 'month' as const }, scale: { type: 'time' as const, domain: [startDate, endOfDay(endDate)] } };

    const speedSpec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('activities-detail', { start: startDate, end: endDate }) },
        transform: [{ filter: 'datum.speed_kmh != null' }],
        mark: { type: 'point', filled: true, size: 80, opacity: 0.8 },
        encoding: {
            x: xEnc,
            y: { field: 'speed_kmh', type: 'quantitative', title: 'Speed (km/h)' },
            color: colorEnc,
            tooltip: [
                { field: 'date', type: 'temporal', title: 'Date' },
                { field: 'type', title: 'Activity' },
                { field: 'speed_kmh', type: 'quantitative', title: 'km/h', format: '.1f' },
            ],
        },
    }), [startDate, endDate, colorScale]);

    const hrSpec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('activities-detail', { start: startDate, end: endDate }) },
        transform: [{ filter: 'datum.avg_hr != null' }],
        layer: [
            {
                mark: { type: 'area', opacity: 0.15 },
                encoding: {
                    x: xEnc,
                    y: { field: 'min_hr', type: 'quantitative', title: 'Heart Rate (bpm)' },
                    y2: { field: 'max_hr' },
                    color: colorEnc,
                },
            },
            {
                mark: { type: 'line', strokeWidth: 2, point: { size: 50 } },
                encoding: {
                    x: xEnc,
                    y: { field: 'avg_hr', type: 'quantitative' },
                    color: colorEnc,
                    tooltip: [
                        { field: 'date', type: 'temporal', title: 'Date' },
                        { field: 'type', title: 'Activity' },
                        { field: 'min_hr', type: 'quantitative', title: 'Min HR' },
                        { field: 'avg_hr', type: 'quantitative', title: 'Avg HR' },
                        { field: 'max_hr', type: 'quantitative', title: 'Max HR' },
                    ],
                },
            },
        ],
    }), [startDate, endDate, colorScale]);

    return (
        <VegaProvider>
            <Box p={4} maxW="1200px" mx="auto">
                <Heading size="lg" mb={4}>Activities</Heading>

                <HStack gap={2} mb={4} flexWrap="wrap">
                    {RANGE_PRESETS.map(p => (
                        <Button key={p.label} size="xs" variant="outline" onClick={() => setRange(p.days)}>
                            {p.label}
                        </Button>
                    ))}
                    <Input type="date" size="xs" value={startDate} onChange={e => setStartDate(e.target.value)} maxW="140px" />
                    <Input type="date" size="xs" value={endDate} onChange={e => setEndDate(e.target.value)} maxW="140px" />
                </HStack>

                {/* Summary cards */}
                <Grid templateColumns={{ base: '1fr', sm: 'repeat(2, 1fr)', lg: `repeat(${Math.min(activityTypes.length, 5)}, 1fr)` }} gap={4} mb={6}>
                    {activityTypes.map(type => {
                        const s = summaryByType[type];
                        if (!s) return null;
                        return (
                            <Box key={type} p={3} borderRadius="md" borderWidth="1px" borderColor={KNOWN_COLORS[type] || FALLBACK_PALETTE[activityTypes.indexOf(type) % FALLBACK_PALETTE.length] || '#888'}>
                                <Text fontWeight="bold" textTransform="capitalize" fontSize="sm">{type.replace('_', ' ')}</Text>
                                <Text fontSize="2xl" fontWeight="bold">{s.count}</Text>
                                <Text fontSize="xs" color="fg.muted">
                                    {Math.round(s.totalMin)} min &middot; {s.totalDist.toFixed(1)} km &middot; {Math.round(s.totalCal)} kcal
                                </Text>
                            </Box>
                        );
                    })}
                </Grid>

                {loading ? (
                    <HStack justifyContent="center" p={8}><Spinner size="sm" /><Text>Loading...</Text></HStack>
                ) : (
                    <VStack align="stretch" gap={6}>
                        <Box>
                            <Heading size="sm" mb={2}>Weekly Frequency</Heading>
                            <VegaPlot spec={weeklyFreqSpec} height="250px" />
                        </Box>

                        <Grid templateColumns={{ base: '1fr', lg: 'repeat(2, 1fr)' }} gap={6}>
                            <Box>
                                <Heading size="sm" mb={2}>Duration Progress</Heading>
                                <VegaPlot spec={durationProgressSpec} height="250px" />
                            </Box>
                            <Box>
                                <Heading size="sm" mb={2}>Distance Progress</Heading>
                                <VegaPlot spec={distanceProgressSpec} height="250px" />
                            </Box>
                            <Box>
                                <Heading size="sm" mb={2}>Speed Evolution</Heading>
                                <VegaPlot spec={speedSpec} height="250px" />
                            </Box>
                            <Box>
                                <Heading size="sm" mb={2}>Calories Burned</Heading>
                                <VegaPlot spec={caloriesProgressSpec} height="250px" />
                            </Box>
                        </Grid>

                        <Box>
                            <Heading size="sm" mb={2}>Heart Rate (min / avg / max)</Heading>
                            <VegaPlot spec={hrSpec} height="250px" />
                        </Box>

                        {/* Activity log table */}
                        <Box>
                            <HStack justify="space-between" mb={2}>
                                <Heading size="sm">Activity Log</Heading>
                                <Text fontSize="xs" color="fg.muted">{activities.length} activities</Text>
                            </HStack>
                            <Box overflowX="auto">
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--chakra-colors-border)' }}>
                                            <th style={{ textAlign: 'left', padding: '6px 8px' }}>Date</th>
                                            <th style={{ textAlign: 'left', padding: '6px 8px' }}>Type</th>
                                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>Duration</th>
                                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>Distance</th>
                                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>Speed</th>
                                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>Calories</th>
                                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>Min HR</th>
                                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>Avg HR</th>
                                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>Max HR</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activities.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(a => (
                                            <tr key={a.id} style={{ borderBottom: '1px solid var(--chakra-colors-border)' }}>
                                                <td style={{ padding: '4px 8px' }}>{new Date(a.date).toLocaleDateString()}</td>
                                                <td style={{ padding: '4px 8px', textTransform: 'capitalize' }}>
                                                    <span style={{ color: KNOWN_COLORS[a.type] || FALLBACK_PALETTE[activityTypes.indexOf(a.type) % FALLBACK_PALETTE.length] || '#888' }}>{a.type.replace('_', ' ')}</span>
                                                </td>
                                                <td style={{ textAlign: 'right', padding: '4px 8px' }}>{a.duration_min.toFixed(0)} min</td>
                                                <td style={{ textAlign: 'right', padding: '4px 8px' }}>{a.distance_km > 0 ? `${a.distance_km.toFixed(1)} km` : '-'}</td>
                                                <td style={{ textAlign: 'right', padding: '4px 8px' }}>{a.speed_kmh ? `${a.speed_kmh} km/h` : '-'}</td>
                                                <td style={{ textAlign: 'right', padding: '4px 8px' }}>{a.calories || '-'}</td>
                                                <td style={{ textAlign: 'right', padding: '4px 8px' }}>{a.min_hr || '-'}</td>
                                                <td style={{ textAlign: 'right', padding: '4px 8px' }}>{a.avg_hr || '-'}</td>
                                                <td style={{ textAlign: 'right', padding: '4px 8px' }}>{a.max_hr || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Box>
                            {activities.length > PAGE_SIZE && (
                                <HStack justify="center" mt={3} gap={2}>
                                    <Button size="xs" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                                        Previous
                                    </Button>
                                    <Text fontSize="xs" color="fg.muted">
                                        {page + 1} / {Math.ceil(activities.length / PAGE_SIZE)}
                                    </Text>
                                    <Button size="xs" variant="outline" disabled={(page + 1) * PAGE_SIZE >= activities.length} onClick={() => setPage(p => p + 1)}>
                                        Next
                                    </Button>
                                </HStack>
                            )}
                        </Box>
                    </VStack>
                )}
            </Box>
        </VegaProvider>
    );
};

export default HealthActivities;
