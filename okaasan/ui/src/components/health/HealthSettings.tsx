import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Box, Button, Flex, Grid, Heading, HStack, Input, Text, VStack,
    Spinner,
} from '@chakra-ui/react';
import { Toaster, toaster } from '../ui/toaster';
import { recipeAPI } from '../../services/api';
import type { HealthConnector } from '../../services/type';
import { useNotifications } from '../../hooks/useNotifications';

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

    // Garmin export import
    const exportRef = useRef<HTMLInputElement>(null);
    const [exportLoading, setExportLoading] = useState(false);
    const [exportLogs, setExportLogs] = useState<LogEntry[]>([]);
    const [exportPath, setExportPath] = useState('');

    // USB auto-import
    const [usbStatus, setUsbStatus] = useState<{ rule_installed: boolean; last_import: any } | null>(null);
    const [usbImporting, setUsbImporting] = useState<string | null>(null);

    useNotifications((event) => {
        if (event.type === 'usb_import') {
            if (event.status === 'started') {
                setUsbImporting('Garmin connected — importing FIT files...');
            } else if (event.status === 'copying') {
                setUsbImporting(`Found ${event.files_found} new file(s), importing...`);
            } else if (event.status === 'importing') {
                setUsbImporting(`Importing ${event.progress}/${event.total}...`);
            } else if (event.status === 'done') {
                setUsbImporting(null);
                setUsbStatus((prev) => prev ? { ...prev, last_import: event } : prev);
                toaster.create({
                    title: 'USB Import Complete',
                    description: `${event.files_imported} file(s) imported`,
                    type: 'success',
                });
            } else if (event.status === 'error') {
                setUsbImporting(null);
                toaster.create({ title: 'USB Import Failed', description: event.error, type: 'error' });
            }
        }
        if (event.type === 'garmin_sync') {
            if (event.status === 'done') {
                toaster.create({ title: 'Garmin Sync Complete', description: event.message || 'Daily sync finished', type: 'success' });
            }
        }
    });

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
        recipeAPI.getUsbGarminStatus()
            .then((r) => setUsbStatus(r))
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

    const handleExportImport = async () => {
        const file = exportRef.current?.files?.[0];
        if (!file) return;
        setExportLoading(true);
        setExportLogs([{ text: 'Uploading and importing Garmin export...', type: 'info' }]);
        try {
            const form = new FormData();
            form.append('file', file);
            await recipeAPI.requestSSE('/health-data/import/garmin-export', {
                method: 'POST',
                body: form,
            }, (evt) => {
                if (evt.progress) {
                    setExportLogs((prev) => [...prev, { text: evt.progress, type: 'info' }]);
                }
                if (evt.done) {
                    const r = evt.result || {};
                    const lines: LogEntry[] = [];
                    if (r.daily_summaries) lines.push({ text: `Daily summaries: ${r.daily_summaries.inserted} new, ${r.daily_summaries.skipped} updated`, type: 'success' });
                    if (r.health_metrics) lines.push({ text: `Health metrics: ${r.health_metrics.inserted} new, ${r.health_metrics.skipped} skipped`, type: 'success' });
                    if (r.fit_files) lines.push({ text: `FIT files: ${r.fit_files.extracted} extracted, ${r.fit_files.imported} imported`, type: 'success' });
                    setExportLogs((prev) => [...prev, ...lines, { text: 'Import complete!', type: 'success' }]);
                }
                if (evt.error) {
                    setExportLogs((prev) => [...prev, { text: `Error: ${evt.error}`, type: 'error' }]);
                }
            });
        } catch (err: any) {
            setExportLogs((prev) => [...prev, { text: `Failed: ${err.message}`, type: 'error' }]);
        } finally {
            setExportLoading(false);
        }
    };

    const handleExportFromPath = async () => {
        if (!exportPath.trim()) return;
        setExportLoading(true);
        setExportLogs([{ text: `Importing from ${exportPath}...`, type: 'info' }]);
        try {
            await recipeAPI.requestSSE('/health-data/import/garmin-export-path', {
                method: 'POST',
                body: JSON.stringify({ path: exportPath.trim() }),
            }, (evt) => {
                if (evt.progress) {
                    setExportLogs((prev) => [...prev, { text: evt.progress, type: 'info' }]);
                }
                if (evt.done) {
                    const r = evt.result || {};
                    const lines: LogEntry[] = [];
                    if (r.daily_summaries) lines.push({ text: `Daily summaries: ${r.daily_summaries.inserted} new, ${r.daily_summaries.skipped} updated`, type: 'success' });
                    if (r.health_metrics) lines.push({ text: `Health metrics: ${r.health_metrics.inserted} new, ${r.health_metrics.skipped} skipped`, type: 'success' });
                    if (r.fit_files) lines.push({ text: `FIT files: ${r.fit_files.extracted} extracted, ${r.fit_files.imported} imported`, type: 'success' });
                    setExportLogs((prev) => [...prev, ...lines, { text: 'Import complete!', type: 'success' }]);
                }
                if (evt.error) {
                    setExportLogs((prev) => [...prev, { text: `Error: ${evt.error}`, type: 'error' }]);
                }
            });
        } catch (err: any) {
            setExportLogs((prev) => [...prev, { text: `Failed: ${err.message}`, type: 'error' }]);
        } finally {
            setExportLoading(false);
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
                                Daily auto-sync at 1 AM local time
                            </label>
                            {autoSyncLoading && <Spinner size="xs" />}
                        </HStack>
                        <Text fontSize="xs" color="var(--muted-text)" mt={1}>
                            Automatically fetches yesterday's and today's data once per day ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
                        </Text>
                    </Box>
                </Box>

                {/* Garmin Data Export Import */}
                <Box p={5} border="1px solid" borderColor="gray.200" borderRadius="lg">
                    <Heading size="md" mb={3}>Garmin Data Export</Heading>
                    <Text fontSize="xs" color="gray.500" mb={3}>
                        Import from a Garmin account data export ZIP. Extracts daily summaries, health metrics (HRV, HR, SpO2, respiration), and FIT files.
                    </Text>

                    <VStack gap={3} align="stretch">
                        <Box>
                            <Text fontSize="sm" fontWeight="medium" mb={1}>Upload ZIP file</Text>
                            <HStack gap={2}>
                                <input
                                    ref={exportRef}
                                    type="file"
                                    accept=".zip"
                                    style={{ fontSize: '0.85rem' }}
                                />
                                <Button size="sm" onClick={handleExportImport} disabled={exportLoading}>
                                    {exportLoading ? <><Spinner size="xs" mr={2} /> Importing…</> : 'Upload & Import'}
                                </Button>
                            </HStack>
                        </Box>

                        <Box>
                            <Text fontSize="sm" fontWeight="medium" mb={1}>Or import from server path</Text>
                            <HStack gap={2}>
                                <input
                                    type="text"
                                    value={exportPath}
                                    onChange={(e) => setExportPath(e.target.value)}
                                    placeholder="private/garmin_dump/export.zip"
                                    style={{ fontSize: '0.85rem', flex: 1, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                                />
                                <Button size="sm" onClick={handleExportFromPath} disabled={exportLoading || !exportPath.trim()}>
                                    {exportLoading ? <><Spinner size="xs" mr={2} /> Importing…</> : 'Import'}
                                </Button>
                            </HStack>
                        </Box>
                    </VStack>

                    <LogPanel logs={exportLogs} visible={exportLogs.length > 0} />
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

                {/* USB Auto-Import */}
                <Box p={5} border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
                    <Heading size="md" mb={3} color="var(--heading-color)">USB Auto-Import</Heading>
                    <Text fontSize="xs" color="var(--muted-text)" mb={3}>
                        Automatically import FIT files when a Garmin device is plugged into the server via USB.
                    </Text>

                    <HStack gap={2} mb={3}>
                        <Box
                            w="10px" h="10px" borderRadius="full"
                            bg={usbStatus?.rule_installed ? 'var(--panel-green-border)' : 'var(--empty-text)'}
                        />
                        <Text fontSize="sm">
                            udev rule: {usbStatus?.rule_installed ? 'Installed' : 'Not installed'}
                        </Text>
                    </HStack>

                    {usbImporting && (
                        <HStack gap={2} mb={3} p={3} bg="var(--selected-bg)" borderRadius="md">
                            <Spinner size="xs" />
                            <Text fontSize="sm">{usbImporting}</Text>
                        </HStack>
                    )}

                    {usbStatus?.last_import ? (
                        <Box mb={3} p={3} bg="var(--surface-muted)" borderRadius="md">
                            <Text fontSize="sm" fontWeight="medium">Last USB import</Text>
                            <Text fontSize="xs" color="var(--muted-text)">
                                {new Date(usbStatus.last_import.timestamp).toLocaleString()}
                                {' — '}
                                {usbStatus.last_import.files_copied} copied,{' '}
                                {usbStatus.last_import.files_imported} imported
                                {usbStatus.last_import.errors > 0 && `, ${usbStatus.last_import.errors} errors`}
                            </Text>
                        </Box>
                    ) : (
                        <Text fontSize="xs" color="var(--muted-text)" mb={3}>No USB imports yet.</Text>
                    )}

                    {!usbStatus?.rule_installed && (
                        <Box p={3} bg="var(--surface-muted)" borderRadius="md" border="1px solid" borderColor="var(--border-color)">
                            <Text fontSize="sm" fontWeight="medium" mb={1}>Setup</Text>
                            <Text fontSize="xs" color="var(--muted-text)">
                                Run on the server:
                            </Text>
                            <Box as="code" display="block" fontSize="xs" bg="var(--key-bg)" color="var(--heading-color)" p={2} borderRadius="sm" mt={1} fontFamily="mono">
                                make install-garmin-udev
                            </Box>
                            <Text fontSize="xs" color="var(--muted-text)" mt={2}>
                                Then plug in your Garmin watch — FIT files will be imported automatically.
                            </Text>
                        </Box>
                    )}
                </Box>
            </Grid>
        </Box>
    );
};

export default HealthSettings;
