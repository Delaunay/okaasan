import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Grid, Heading, HStack, Text, VStack, Spinner, Button, Input } from '@chakra-ui/react';
import { VegaProvider } from '../../contexts/VegaContext';
import VegaPlot from './VegaPlot';
import { healthDataUrl, endOfDay, updateHealthActivity } from '../../services/api';
import { privateJsonStore } from '../../services/jsonstore';

const LABELS_COLLECTION = 'health-settings';
const LABELS_KEY = 'activity-labels';

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

    const fetchActivities = useCallback(() => {
        setLoading(true);
        return fetch(healthDataUrl('activities-detail', { start: startDate, end: endDate }))
            .then(r => r.json())
            .then(data => { setActivities(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, [startDate, endDate]);

    useEffect(() => {
        setPage(0);
        fetchActivities();
    }, [fetchActivities]);

    const [editingId, setEditingId] = useState<number | null>(null);
    const [editType, setEditType] = useState('');
    const [editDuration, setEditDuration] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);

    const startEdit = useCallback((a: Activity) => {
        setEditingId(a.id);
        setEditType(a.type);
        setEditDuration(String(a.duration_min));
    }, []);

    const cancelEdit = useCallback(() => {
        setEditingId(null);
    }, []);

    const saveEdit = useCallback(async () => {
        if (editingId == null) return;
        const duration = parseFloat(editDuration);
        setSavingEdit(true);
        try {
            await updateHealthActivity(editingId, {
                activity_type: editType,
                duration_min: Number.isFinite(duration) ? duration : undefined,
            });
            setEditingId(null);
            await fetchActivities();
        } catch (err) {
            console.error('Failed to update activity', err);
        } finally {
            setSavingEdit(false);
        }
    }, [editingId, editType, editDuration, fetchActivities]);

    const activityTypes = useMemo(() => {
        const types = new Set(activities.map(a => a.type));
        return Array.from(types).sort();
    }, [activities]);

    const [labelMap, setLabelMap] = useState<Record<string, string>>({});
    const [showRename, setShowRename] = useState(false);
    const [renameDraft, setRenameDraft] = useState<Record<string, string>>({});
    const [savingLabels, setSavingLabels] = useState(false);

    useEffect(() => {
        privateJsonStore.get<Record<string, string>>(LABELS_COLLECTION, LABELS_KEY)
            .then(setLabelMap)
            .catch(() => setLabelMap({}));
    }, []);

    const label = useCallback((type: string) => labelMap[type] || type, [labelMap]);

    const openRename = useCallback(() => {
        const draft: Record<string, string> = {};
        for (const t of activityTypes) draft[t] = label(t);
        setRenameDraft(draft);
        setShowRename(true);
    }, [activityTypes, label]);

    const saveLabels = useCallback(async () => {
        setSavingLabels(true);
        try {
            const cleaned: Record<string, string> = {};
            for (const [t, lbl] of Object.entries(renameDraft)) {
                const trimmed = lbl.trim();
                if (trimmed && trimmed !== t) cleaned[t] = trimmed;
            }
            await privateJsonStore.put(LABELS_COLLECTION, LABELS_KEY, cleaned);
            setLabelMap(cleaned);
            setShowRename(false);
        } catch (err) {
            console.error('Failed to save activity display names', err);
        } finally {
            setSavingLabels(false);
        }
    }, [renameDraft]);

    const rawTypesByLabel = useMemo(() => {
        const map: Record<string, string[]> = {};
        for (const t of activityTypes) {
            const lbl = label(t);
            (map[lbl] ||= []).push(t);
        }
        return map;
    }, [activityTypes, label]);

    const labels = useMemo(() => Object.keys(rawTypesByLabel).sort(), [rawTypesByLabel]);

    const colorScale = useMemo(() => {
        const domain: string[] = [];
        const range: string[] = [];
        let fallbackIdx = 0;
        for (const lbl of labels) {
            domain.push(lbl);
            const rawMatch = rawTypesByLabel[lbl].find(t => KNOWN_COLORS[t]);
            if (rawMatch) {
                range.push(KNOWN_COLORS[rawMatch]);
            } else {
                range.push(FALLBACK_PALETTE[fallbackIdx % FALLBACK_PALETTE.length]);
                fallbackIdx++;
            }
        }
        return { domain, range };
    }, [labels, rawTypesByLabel]);

    const colorForLabel = useMemo(
        () => Object.fromEntries(colorScale.domain.map((d, i) => [d, colorScale.range[i]])),
        [colorScale]
    );

    const labelLookup = useMemo(
        () => activityTypes.map(t => ({ type: t, label: label(t) })),
        [activityTypes, label]
    );

    const lookupTransform = useMemo(
        () => ({ lookup: 'type', from: { data: { values: labelLookup }, key: 'type', fields: ['label'] } }),
        [labelLookup]
    );

    const summaryByLabel = useMemo(() => {
        const map: Record<string, { count: number; totalMin: number; totalDist: number; totalCal: number }> = {};
        for (const a of activities) {
            const lbl = label(a.type);
            if (!map[lbl]) map[lbl] = { count: 0, totalMin: 0, totalDist: 0, totalCal: 0 };
            map[lbl].count++;
            map[lbl].totalMin += a.duration_min;
            map[lbl].totalDist += a.distance_km;
            map[lbl].totalCal += a.calories || 0;
        }
        return map;
    }, [activities, label]);

    const durationProgressSpec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('activities-detail', { start: startDate, end: endDate }) },
        transform: [lookupTransform],
        mark: { type: 'point', filled: true, size: 80, opacity: 0.8 },
        encoding: {
            x: { field: 'date', type: 'temporal', title: null, scale: { type: 'time', domain: [startDate, endOfDay(endDate)] } },
            y: { field: 'duration_min', type: 'quantitative', title: 'Duration (min)' },
            color: { field: 'label', type: 'nominal', legend: null, scale: colorScale },
            tooltip: [
                { field: 'date', type: 'temporal', title: 'Date' },
                { field: 'label', title: 'Activity' },
                { field: 'duration_min', type: 'quantitative', title: 'Minutes', format: '.0f' },
            ],
        },
    }), [startDate, endDate, colorScale, lookupTransform]);

    const distanceProgressSpec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('activities-detail', { start: startDate, end: endDate }) },
        transform: [
            lookupTransform,
            { filter: 'datum.distance_km > 0' },
            { timeUnit: 'yearmonthdate', field: 'date', as: 'day' },
            { aggregate: [{ op: 'sum', field: 'distance_km', as: 'distance_km' }], groupby: ['day', 'label'] },
        ],
        mark: { type: 'point', filled: true, size: 80, opacity: 0.8 },
        encoding: {
            x: { field: 'day', type: 'temporal', title: null, scale: { type: 'time', domain: [startDate, endOfDay(endDate)] } },
            y: { field: 'distance_km', type: 'quantitative', title: 'Distance (km)' },
            color: { field: 'label', type: 'nominal', legend: null, scale: colorScale },
            tooltip: [
                { field: 'day', type: 'temporal', title: 'Date' },
                { field: 'label', title: 'Activity' },
                { field: 'distance_km', type: 'quantitative', title: 'km', format: '.1f' },
            ],
        },
    }), [startDate, endDate, colorScale, lookupTransform]);

    const caloriesProgressSpec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('activities-detail', { start: startDate, end: endDate }) },
        transform: [
            lookupTransform,
            { filter: 'datum.calories > 0' },
            { timeUnit: 'yearmonthdate', field: 'date', as: 'day' },
            { aggregate: [{ op: 'sum', field: 'calories', as: 'calories' }], groupby: ['day', 'label'] },
        ],
        mark: { type: 'bar', opacity: 0.7 },
        encoding: {
            x: { field: 'day', type: 'temporal', title: null, scale: { type: 'time', domain: [startDate, endOfDay(endDate)] } },
            y: { field: 'calories', type: 'quantitative', title: 'Calories', stack: true },
            color: { field: 'label', type: 'nominal', legend: null, scale: colorScale },
            tooltip: [
                { field: 'day', type: 'temporal', title: 'Date' },
                { field: 'label', title: 'Activity' },
                { field: 'calories', type: 'quantitative', title: 'kcal' },
            ],
        },
    }), [startDate, endDate, colorScale, lookupTransform]);

    const weeklyFreqSpec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('activities-detail', { start: startDate, end: endDate }) },
        transform: [
            lookupTransform,
            { timeUnit: 'yearweek', field: 'date', as: 'week' },
            { aggregate: [{ op: 'count', as: 'sessions' }], groupby: ['week', 'label'] },
        ],
        mark: { type: 'bar', opacity: 0.7 },
        encoding: {
            x: { field: 'week', type: 'temporal', title: null, axis: { tickCount: 'month' } },
            y: { field: 'sessions', type: 'quantitative', title: 'Sessions / Week', stack: true },
            color: { field: 'label', type: 'nominal', legend: { title: null }, scale: colorScale },
            tooltip: [
                { field: 'week', type: 'temporal', title: 'Week' },
                { field: 'label', title: 'Activity' },
                { field: 'sessions', type: 'quantitative', title: 'Sessions' },
            ],
        },
    }), [startDate, endDate, colorScale, lookupTransform]);

    const colorEnc = { field: 'label', type: 'nominal' as const, legend: null, scale: colorScale };
    const xEnc = { field: 'date', type: 'temporal' as const, title: null, axis: { tickCount: 'month' as const }, scale: { type: 'time' as const, domain: [startDate, endOfDay(endDate)] } };

    const speedSpec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('activities-detail', { start: startDate, end: endDate }) },
        transform: [lookupTransform, { filter: 'datum.speed_kmh != null' }],
        mark: { type: 'point', filled: true, size: 80, opacity: 0.8 },
        encoding: {
            x: xEnc,
            y: { field: 'speed_kmh', type: 'quantitative', title: 'Speed (km/h)' },
            color: colorEnc,
            tooltip: [
                { field: 'date', type: 'temporal', title: 'Date' },
                { field: 'label', title: 'Activity' },
                { field: 'speed_kmh', type: 'quantitative', title: 'km/h', format: '.1f' },
            ],
        },
    }), [startDate, endDate, colorScale, lookupTransform]);

    const hrSpec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('activities-detail', { start: startDate, end: endDate }) },
        transform: [lookupTransform, { filter: 'datum.avg_hr != null' }],
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
                        { field: 'label', title: 'Activity' },
                        { field: 'min_hr', type: 'quantitative', title: 'Min HR' },
                        { field: 'avg_hr', type: 'quantitative', title: 'Avg HR' },
                        { field: 'max_hr', type: 'quantitative', title: 'Max HR' },
                    ],
                },
            },
        ],
    }), [startDate, endDate, colorScale, lookupTransform]);

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
                    <Button size="xs" variant="outline" onClick={() => (showRename ? setShowRename(false) : openRename())}>
                        {showRename ? 'Close' : 'Rename activities'}
                    </Button>
                </HStack>

                {showRename && (
                    <Box borderWidth="1px" borderRadius="md" p={3} mb={4}>
                        <Text fontSize="sm" fontWeight="bold" mb={2}>Display names</Text>
                        <VStack align="stretch" gap={2}>
                            {activityTypes.map(t => (
                                <HStack key={t} justify="space-between">
                                    <Text fontSize="sm" color="fg.muted" textTransform="capitalize" minW="140px">{t.replace('_', ' ')}</Text>
                                    <Input
                                        size="xs"
                                        maxW="200px"
                                        value={renameDraft[t] ?? t}
                                        onChange={e => setRenameDraft(d => ({ ...d, [t]: e.target.value }))}
                                    />
                                </HStack>
                            ))}
                        </VStack>
                        <HStack mt={3} justify="flex-end" gap={2}>
                            <Button size="xs" variant="outline" onClick={() => setShowRename(false)} disabled={savingLabels}>Cancel</Button>
                            <Button size="xs" colorPalette="blue" onClick={saveLabels} loading={savingLabels}>Save</Button>
                        </HStack>
                    </Box>
                )}

                {/* Summary cards */}
                <Grid templateColumns={{ base: '1fr', sm: 'repeat(2, 1fr)', lg: `repeat(${Math.min(labels.length, 5)}, 1fr)` }} gap={4} mb={6}>
                    {labels.map(lbl => {
                        const s = summaryByLabel[lbl];
                        if (!s) return null;
                        return (
                            <Box key={lbl} p={3} borderRadius="md" borderWidth="1px" borderColor={colorForLabel[lbl] || '#888'}>
                                <Text fontWeight="bold" textTransform="capitalize" fontSize="sm">{lbl.replace('_', ' ')}</Text>
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
                                <Heading size="sm" mb={2}>Calories Burned</Heading>
                                <VegaPlot spec={caloriesProgressSpec} height="250px" />
                            </Box>
                            <Box>
                                <Heading size="sm" mb={2}>Speed Evolution</Heading>
                                <VegaPlot spec={speedSpec} height="250px" />
                            </Box>
                            <Box>
                                <Heading size="sm" mb={2}>Distance Progress</Heading>
                                <VegaPlot spec={distanceProgressSpec} height="250px" />
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
                                            <th style={{ textAlign: 'right', padding: '6px 8px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activities.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(a => {
                                            const isEditing = editingId === a.id;
                                            return (
                                                <tr key={a.id} style={{ borderBottom: '1px solid var(--chakra-colors-border)' }}>
                                                    <td style={{ padding: '4px 8px' }}>{new Date(a.date).toLocaleDateString()}</td>
                                                    <td style={{ padding: '4px 8px', textTransform: 'capitalize' }}>
                                                        {isEditing ? (
                                                            <select
                                                                value={editType}
                                                                onChange={e => setEditType(e.target.value)}
                                                                style={{ fontSize: '0.85rem', padding: '2px 4px' }}
                                                            >
                                                                {Array.from(new Set([...activityTypes, ...Object.keys(KNOWN_COLORS), editType])).sort().map(t => (
                                                                    <option key={t} value={t}>{t.replace('_', ' ')}</option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <span style={{ color: colorForLabel[label(a.type)] || '#888' }}>{label(a.type).replace('_', ' ')}</span>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>
                                                        {isEditing ? (
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step={1}
                                                                value={editDuration}
                                                                onChange={e => setEditDuration(e.target.value)}
                                                                style={{ width: '70px', fontSize: '0.85rem', padding: '2px 4px', textAlign: 'right' }}
                                                            />
                                                        ) : (
                                                            `${a.duration_min.toFixed(0)} min`
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{a.distance_km > 0 ? `${a.distance_km.toFixed(1)} km` : '-'}</td>
                                                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{a.speed_kmh ? `${a.speed_kmh} km/h` : '-'}</td>
                                                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{a.calories || '-'}</td>
                                                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{a.min_hr || '-'}</td>
                                                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{a.avg_hr || '-'}</td>
                                                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{a.max_hr || '-'}</td>
                                                    <td style={{ textAlign: 'right', padding: '4px 8px', whiteSpace: 'nowrap' }}>
                                                        {isEditing ? (
                                                            <HStack gap={1} justify="flex-end">
                                                                <Button size="2xs" colorPalette="green" onClick={saveEdit} loading={savingEdit}>Save</Button>
                                                                <Button size="2xs" variant="outline" onClick={cancelEdit} disabled={savingEdit}>Cancel</Button>
                                                            </HStack>
                                                        ) : (
                                                            <Button size="2xs" variant="outline" onClick={() => startEdit(a)}>Edit</Button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
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
