import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Box, Button, Flex, Grid, Heading, HStack, Input, Text, VStack,
    Spinner,
} from '@chakra-ui/react';
import { Toaster, toaster } from '../ui/toaster';
import { recipeAPI } from '../../services/api';
import type { HealthConnector } from '../../services/type';

interface LogEntry {
    text: string;
    type: 'info' | 'success' | 'error';
}

const LogPanel: React.FC<{ logs: LogEntry[]; visible: boolean }> = ({ logs, visible }) => {
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs.length]);

    if (!visible || logs.length === 0) return null;

    return (
        <Box
            mt={3}
            p={3}
            bg="gray.50"
            borderRadius="md"
            maxH="200px"
            overflowY="auto"
            fontSize="xs"
            fontFamily="mono"
            border="1px solid"
            borderColor="gray.200"
            _dark={{ bg: 'gray.800', borderColor: 'gray.600' }}
        >
            {logs.map((entry, i) => (
                <Text
                    key={i}
                    color={entry.type === 'error' ? 'red.500' : entry.type === 'success' ? 'green.500' : 'gray.600'}
                    _dark={{
                        color: entry.type === 'error' ? 'red.300' : entry.type === 'success' ? 'green.300' : 'gray.400',
                    }}
                >
                    {entry.text}
                </Text>
            ))}
            <div ref={endRef} />
        </Box>
    );
};

const HealthSettings: React.FC = () => {
    const [connectors, setConnectors] = useState<HealthConnector[]>([]);
    const [loading, setLoading] = useState(true);

    // Garmin login
    const [garminEmail, setGarminEmail] = useState('');
    const [garminPassword, setGarminPassword] = useState('');
    const [garminLoading, setGarminLoading] = useState(false);

    // Garmin sync
    const fiveYearsAgo = new Date(Date.now() - 5 * 365.25 * 86400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const [syncStart, setSyncStart] = useState(fiveYearsAgo);
    const [syncEnd, setSyncEnd] = useState(today);
    const [syncLoading, setSyncLoading] = useState(false);
    const [syncLogs, setSyncLogs] = useState<LogEntry[]>([]);
    const [syncReplay, setSyncReplay] = useState(false);
    const [syncForce, setSyncForce] = useState(false);

    // Auto-sync
    const [autoSync, setAutoSync] = useState(false);
    const [autoSyncLoading, setAutoSyncLoading] = useState(false);

    // FIT import
    const [fitDir, setFitDir] = useState('');
    const [fitLoading, setFitLoading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploadLoading, setUploadLoading] = useState(false);
    const [reprocessLoading, setReprocessLoading] = useState(false);
    const [fitLogs, setFitLogs] = useState<LogEntry[]>([]);

    const refreshConnectors = useCallback(async () => {
        try {
            const data = await recipeAPI.getHealthConnectors();
            setConnectors(data);
        } catch { /* ignore */ }
        setLoading(false);
    }, []);

    useEffect(() => { refreshConnectors(); }, [refreshConnectors]);

    useEffect(() => {
        recipeAPI.getSchedulerStatus()
            .then((r) => setAutoSync(r.enabled))
            .catch(() => {});
    }, []);

    const handleAutoSyncToggle = async (enabled: boolean) => {
        setAutoSyncLoading(true);
        try {
            const r = await recipeAPI.setSchedulerEnabled(enabled);
            setAutoSync(r.enabled);
        } catch (err: any) {
            toaster.create({ title: 'Failed to toggle auto-sync', description: err.message, type: 'error' });
        } finally {
            setAutoSyncLoading(false);
        }
    };

    const garminConnector = connectors.find((c) => c.name === 'garmin');

    const handleGarminLogin = async () => {
        setGarminLoading(true);
        try {
            const result = await recipeAPI.garminLogin(garminEmail, garminPassword);
            toaster.create({ title: `Connected as ${result.display_name || garminEmail}`, type: 'success' });
            setGarminPassword('');
            await refreshConnectors();
        } catch (err: any) {
            toaster.create({ title: 'Login failed', description: err.message, type: 'error' });
        } finally {
            setGarminLoading(false);
        }
    };

    const handleSync = async () => {
        setSyncLoading(true);
        setSyncLogs([{ text: 'Starting sync…', type: 'info' }]);
        let totalInserted = 0;
        let totalSkipped = 0;

        try {
            await recipeAPI.syncGarmin(
                { start: syncStart || undefined, end: syncEnd || undefined, replay: syncReplay || undefined, dup_threshold: syncForce ? 999999 : undefined },
                (evt) => {
                    if (evt.fatal) {
                        setSyncLogs((prev) => [...prev, { text: `Fatal: ${evt.error}`, type: 'error' }]);
                        return;
                    }
                    if (evt.done) {
                        setSyncLogs((prev) => [...prev, {
                            text: `Done — ${evt.days_synced} day(s) synced. ${totalInserted} inserted, ${totalSkipped} skipped.`,
                            type: 'success',
                        }]);
                        return;
                    }

                    if (evt.stopped) {
                        setSyncLogs((prev) => [...prev, {
                            text: `Stopped — ${evt.reason}. ${evt.days_synced} day(s) checked, ${totalInserted} inserted.`,
                            type: 'success',
                        }]);
                        return;
                    }

                    const m = evt.result?.metrics;
                    const a = evt.result?.activities;
                    const ds = evt.result?.daily_summary;
                    const ins = (m?.inserted || 0) + (a?.inserted || 0) + (ds?.inserted || 0);
                    const skip = (m?.skipped || 0) + (a?.skipped || 0) + (ds?.skipped || 0);
                    totalInserted += ins;
                    totalSkipped += skip;

                    if (evt.error) {
                        setSyncLogs((prev) => [...prev, {
                            text: `${evt.day}: error — ${evt.error}`,
                            type: 'error',
                        }]);
                    } else {
                        setSyncLogs((prev) => [...prev, {
                            text: `${evt.day}: +${ins} new, ${skip} skipped`,
                            type: ins > 0 ? 'success' : 'info',
                        }]);
                    }
                },
            );
        } catch (err: any) {
            setSyncLogs((prev) => [...prev, { text: `Error: ${err.message}`, type: 'error' }]);
            toaster.create({ title: 'Sync failed', description: err.message, type: 'error' });
        } finally {
            setSyncLoading(false);
        }
    };

    const addFitLog = (entry: LogEntry) => setFitLogs((prev) => [...prev, entry]);

    const handleFitUpload = async () => {
        const files = fileRef.current?.files;
        if (!files?.length) return;
        setUploadLoading(true);
        setFitLogs([{ text: `Uploading ${files.length} file(s)…`, type: 'info' }]);
        let count = 0;
        for (const file of Array.from(files)) {
            try {
                const r = await recipeAPI.importFitFile(file);
                const ins = (r.metrics?.inserted || 0) + (r.activities?.inserted || 0);
                addFitLog({ text: `${file.name}: +${ins} records`, type: 'success' });
                count++;
            } catch (err: any) {
                addFitLog({ text: `${file.name}: ${err.message}`, type: 'error' });
            }
        }
        addFitLog({ text: `Done — ${count} of ${files.length} file(s) imported.`, type: count > 0 ? 'success' : 'info' });
        setUploadLoading(false);
    };

    const handleFitDir = async () => {
        if (!fitDir.trim()) return;
        setFitLoading(true);
        setFitLogs([{ text: `Copying from ${fitDir}…`, type: 'info' }]);
        try {
            const result = await recipeAPI.importFitFromDir(fitDir.trim());
            const n = result.copied || 0;
            addFitLog({ text: `Copied ${n} new file(s)`, type: n > 0 ? 'success' : 'info' });
            for (const r of result.results || []) {
                if (r.error) {
                    addFitLog({ text: `  ${r.file}: ${r.error}`, type: 'error' });
                } else {
                    const ins = (r.metrics?.inserted || 0) + (r.activities?.inserted || 0);
                    addFitLog({ text: `  ${r.file}: +${ins} records`, type: 'success' });
                }
            }
        } catch (err: any) {
            addFitLog({ text: `Error: ${err.message}`, type: 'error' });
        } finally {
            setFitLoading(false);
        }
    };

    const handleReprocess = async () => {
        setReprocessLoading(true);
        setFitLogs([{ text: 'Reprocessing local archive…', type: 'info' }]);
        try {
            const result = await recipeAPI.reprocessFitFiles();
            for (const r of result.results || []) {
                if (r.error) {
                    addFitLog({ text: `${r.file}: ${r.error}`, type: 'error' });
                } else {
                    const ins = (r.metrics?.inserted || 0) + (r.activities?.inserted || 0);
                    const skip = (r.metrics?.skipped || 0) + (r.activities?.skipped || 0);
                    addFitLog({ text: `${r.file}: +${ins} new, ${skip} skipped`, type: ins > 0 ? 'success' : 'info' });
                }
            }
            addFitLog({ text: `Done — ${(result.results || []).length} file(s) processed.`, type: 'success' });
        } catch (err: any) {
            addFitLog({ text: `Error: ${err.message}`, type: 'error' });
        } finally {
            setReprocessLoading(false);
        }
    };

    if (loading) {
        return <Flex justify="center" py={10}><Spinner size="lg" /></Flex>;
    }

    return (
        <Box width="100%" maxW="900px" mx="auto" p={4}>
            <Toaster />
            <Heading size="lg" mb={6}>Health Settings</Heading>

            <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={6}>
                {/* Garmin Connect */}
                <Box p={5} border="1px solid" borderColor="gray.200" borderRadius="lg">
                    <Heading size="md" mb={3}>Garmin Connect</Heading>

                    {garminConnector?.enabled && garminConnector.config?.display_name ? (
                        <Text fontSize="sm" mb={3} color="green.600">
                            Connected as {garminConnector.config.display_name}
                        </Text>
                    ) : (
                        <Text fontSize="sm" mb={3} color="gray.500">Not connected</Text>
                    )}

                    <VStack gap={2} align="stretch" mb={4}>
                        <Input
                            placeholder="Email"
                            size="sm"
                            value={garminEmail}
                            onChange={(e) => setGarminEmail(e.target.value)}
                        />
                        <Input
                            placeholder="Password"
                            type="password"
                            size="sm"
                            value={garminPassword}
                            onChange={(e) => setGarminPassword(e.target.value)}
                        />
                        <Button
                            size="sm"
                            colorPalette="blue"
                            onClick={handleGarminLogin}
                            disabled={!garminEmail || !garminPassword || garminLoading}
                        >
                            {garminLoading ? <Spinner size="xs" /> : 'Login'}
                        </Button>
                    </VStack>

                    <Heading size="sm" mb={2}>Sync Data</Heading>
                    <HStack gap={1} mb={2}>
                        {([['1D', 1], ['1W', 7], ['1M', 30], ['1Y', 365]] as const).map(([label, days]) => (
                            <Button
                                key={label}
                                size="xs"
                                variant="outline"
                                onClick={() => {
                                    const end = new Date();
                                    const start = new Date(end.getTime() - days * 86400_000);
                                    setSyncStart(start.toISOString().slice(0, 10));
                                    setSyncEnd(end.toISOString().slice(0, 10));
                                }}
                            >
                                {label}
                            </Button>
                        ))}
                    </HStack>
                    <HStack gap={2} mb={2}>
                        <Input
                            type="date"
                            size="sm"
                            placeholder="Start"
                            value={syncStart}
                            onChange={(e) => setSyncStart(e.target.value)}
                        />
                        <Input
                            type="date"
                            size="sm"
                            placeholder="End"
                            value={syncEnd}
                            onChange={(e) => setSyncEnd(e.target.value)}
                        />
                    </HStack>
                    <HStack gap={3}>
                        <Button size="sm" onClick={handleSync} disabled={syncLoading}>
                            {syncLoading ? <><Spinner size="xs" mr={2} /> Syncing…</> : 'Sync'}
                        </Button>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--chakra-colors-gray-600)', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={syncReplay}
                                onChange={(e) => setSyncReplay(e.target.checked)}
                            />
                            Replay from cache
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--chakra-colors-gray-600)', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={syncForce}
                                onChange={(e) => setSyncForce(e.target.checked)}
                            />
                            Don't stop on duplicates
                        </label>
                    </HStack>

                    <LogPanel logs={syncLogs} visible={syncLogs.length > 0} />

                    <Box mt={4} pt={4} borderTop="1px solid" borderColor="gray.200">
                        <HStack gap={3}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={autoSync}
                                    disabled={autoSyncLoading}
                                    onChange={(e) => handleAutoSyncToggle(e.target.checked)}
                                />
                                Daily auto-sync at 1 AM UTC
                            </label>
                            {autoSyncLoading && <Spinner size="xs" />}
                        </HStack>
                        <Text fontSize="xs" color="gray.500" mt={1}>
                            Automatically fetches yesterday's and today's data once per day.
                        </Text>
                    </Box>
                </Box>

                {/* FIT File Import */}
                <Box p={5} border="1px solid" borderColor="gray.200" borderRadius="lg">
                    <Heading size="md" mb={3}>FIT File Import</Heading>

                    <VStack gap={4} align="stretch">
                        {/* Upload */}
                        <Box>
                            <Text fontSize="sm" fontWeight="medium" mb={1}>Upload .fit files</Text>
                            <HStack gap={2}>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".fit"
                                    multiple
                                    style={{ fontSize: '0.85rem' }}
                                />
                                <Button size="sm" onClick={handleFitUpload} disabled={uploadLoading}>
                                    {uploadLoading ? <Spinner size="xs" /> : 'Import'}
                                </Button>
                            </HStack>
                        </Box>

                        {/* Copy from directory */}
                        <Box>
                            <Text fontSize="sm" fontWeight="medium" mb={1}>
                                Copy from device / directory
                            </Text>
                            <HStack gap={2}>
                                <Input
                                    placeholder="/mnt/garmin/GARMIN/Activity"
                                    size="sm"
                                    value={fitDir}
                                    onChange={(e) => setFitDir(e.target.value)}
                                />
                                <Button size="sm" onClick={handleFitDir} disabled={fitLoading || !fitDir.trim()}>
                                    {fitLoading ? <Spinner size="xs" /> : 'Copy & Import'}
                                </Button>
                            </HStack>
                        </Box>

                        {/* Reprocess */}
                        <Box>
                            <Text fontSize="sm" fontWeight="medium" mb={1}>
                                Reprocess local archive
                            </Text>
                            <Text fontSize="xs" color="gray.500" mb={2}>
                                Re-import all .fit files from the local archive, skipping duplicates.
                            </Text>
                            <Button size="sm" variant="outline" onClick={handleReprocess} disabled={reprocessLoading}>
                                {reprocessLoading ? <><Spinner size="xs" mr={2} /> Processing…</> : 'Reprocess All'}
                            </Button>
                        </Box>
                    </VStack>

                    <LogPanel logs={fitLogs} visible={fitLogs.length > 0} />
                </Box>
            </Grid>
        </Box>
    );
};

export default HealthSettings;
