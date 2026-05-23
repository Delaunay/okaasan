import React, { useEffect, useMemo, useState } from 'react';
import { Box, Heading, Text, Spinner, HStack, Table } from '@chakra-ui/react';
import { VegaProvider } from '../../contexts/VegaContext';
import VegaPlot from '../health/VegaPlot';

interface WheelEntry {
    pytorchVersion: string;
    backendType: 'cuda' | 'rocm' | 'xpu';
    backendVersion: string;
}

const PYTORCH_WHL_URL = 'https://download.pytorch.org/whl/torch/';

function parseBackend(raw: string): { type: 'cuda' | 'rocm' | 'xpu'; version: string } | null {
    const cuMatch = raw.match(/^cu(\d+)$/);
    if (cuMatch) {
        const digits = cuMatch[1];
        const major = digits.slice(0, -1);
        const minor = digits.slice(-1);
        return { type: 'cuda', version: `${parseInt(major)}.${minor}` };
    }

    const rocmMatch = raw.match(/^rocm([\d.]+)$/);
    if (rocmMatch) {
        return { type: 'rocm', version: rocmMatch[1] };
    }

    if (raw === 'xpu') {
        return { type: 'xpu', version: 'xpu' };
    }
    const xpuMatch = raw.match(/^xpu([\d.]+)$/);
    if (xpuMatch) {
        return { type: 'xpu', version: xpuMatch[1] };
    }

    return null;
}

function parseWheelLine(line: string): WheelEntry | null {
    const hrefMatch = line.match(/href="([^"]+)"/);
    if (!hrefMatch) return null;
    const url = hrefMatch[1];

    const pathMatch = url.match(/\/whl\/([^/]+)\//);
    if (!pathMatch) return null;
    const backendSlug = pathMatch[1];

    if (backendSlug === 'cpu') return null;

    const backend = parseBackend(backendSlug);
    if (!backend) return null;

    const filenameMatch = line.match(/torch-([\d.]+(?:\.post\d+)?)/);
    if (!filenameMatch) return null;

    const rawVersion = filenameMatch[1].replace(/\.post\d+$/, '');
    const parts = rawVersion.split('.');
    const pytorchVersion = parts.slice(0, 3).join('.');

    return {
        pytorchVersion,
        backendType: backend.type,
        backendVersion: backend.version,
    };
}

function deduplicateEntries(entries: WheelEntry[]): WheelEntry[] {
    const seen = new Set<string>();
    const result: WheelEntry[] = [];
    for (const e of entries) {
        const key = `${e.pytorchVersion}|${e.backendType}|${e.backendVersion}`;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(e);
        }
    }
    return result;
}

function versionSort(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const va = pa[i] ?? 0;
        const vb = pb[i] ?? 0;
        if (va !== vb) return va - vb;
    }
    return 0;
}

interface SupportRange {
    backendType: string;
    backendVersion: string;
    from: string;
    to: string;
}

function computeSupportRanges(entries: WheelEntry[]): SupportRange[] {
    const allPytorch = [...new Set(entries.map(e => e.pytorchVersion))].sort(versionSort);
    const pytorchIndex = new Map(allPytorch.map((v, i) => [v, i]));

    const grouped = new Map<string, Set<string>>();
    for (const e of entries) {
        const key = `${e.backendType}|${e.backendVersion}`;
        if (!grouped.has(key)) grouped.set(key, new Set());
        grouped.get(key)!.add(e.pytorchVersion);
    }

    const ranges: SupportRange[] = [];
    for (const [key, versions] of grouped) {
        const [backendType, backendVersion] = key.split('|');
        const indices = [...versions].map(v => pytorchIndex.get(v)!).sort((a, b) => a - b);

        let start = indices[0];
        let end = indices[0];
        for (let i = 1; i < indices.length; i++) {
            if (indices[i] === end + 1) {
                end = indices[i];
            } else {
                ranges.push({ backendType, backendVersion, from: allPytorch[start], to: allPytorch[end] });
                start = indices[i];
                end = indices[i];
            }
        }
        ranges.push({ backendType, backendVersion, from: allPytorch[start], to: allPytorch[end] });
    }

    ranges.sort((a, b) => {
        if (a.backendType !== b.backendType) return a.backendType.localeCompare(b.backendType);
        return versionSort(a.backendVersion, b.backendVersion);
    });

    return ranges;
}

const PyTorchWheelsContent: React.FC = () => {
    const [entries, setEntries] = useState<WheelEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [onlyV2, setOnlyV2] = useState(true);

    useEffect(() => {
        let cancelled = false;

        async function fetchAndParse() {
            try {
                const resp = await fetch(PYTORCH_WHL_URL);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const html = await resp.text();
                const lines = html.split('\n');
                const parsed: WheelEntry[] = [];
                for (const line of lines) {
                    if (!line.includes('torch-')) continue;
                    const entry = parseWheelLine(line);
                    if (entry) parsed.push(entry);
                }
                if (!cancelled) {
                    setEntries(deduplicateEntries(parsed));
                    setLoading(false);
                }
            } catch (err: any) {
                if (!cancelled) {
                    setError(err.message || 'Failed to fetch');
                    setLoading(false);
                }
            }
        }

        fetchAndParse();
        return () => { cancelled = true; };
    }, []);

    const filtered = useMemo(() => {
        if (!onlyV2) return entries;
        return entries.filter(e => versionSort(e.pytorchVersion, '2.0.0') >= 0);
    }, [entries, onlyV2]);

    const ranges = useMemo(() => computeSupportRanges(filtered), [filtered]);

    const spec = useMemo(() => {
        if (filtered.length === 0) return null;

        const pytorchVersions = [...new Set(filtered.map(e => e.pytorchVersion))].sort(versionSort);
        const backendVersions = [...new Set(filtered.map(e => e.backendVersion))].sort(versionSort);

        const data = filtered.map(e => ({
            pytorch: e.pytorchVersion,
            backend: e.backendVersion,
            type: e.backendType,
        }));

        return {
            $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
            autosize: { type: 'fit', contains: 'padding' },
            data: { values: data },
            facet: {
                row: { field: 'type', type: 'nominal', title: 'Backend Type' },
            },
            resolve: {
                scale: { y: 'independent' },
            },
            spec: {
                width: { step: 18 },
                height: 200,
                mark: {
                    type: 'circle',
                    size: 80,
                    opacity: 0.85,
                },
                encoding: {
                    x: {
                        field: 'pytorch',
                        type: 'ordinal',
                        title: 'PyTorch Version',
                        sort: pytorchVersions,
                        axis: { labelAngle: -45 },
                    },
                    y: {
                        field: 'backend',
                        type: 'ordinal',
                        title: 'Backend Version',
                        sort: [...backendVersions].reverse(),
                    },
                    color: {
                        field: 'type',
                        type: 'nominal',
                        title: 'Backend',
                        scale: {
                            domain: ['cuda', 'rocm', 'xpu'],
                            range: ['#76b900', '#ed1c24', '#0071c5'],
                        },
                    },
                    tooltip: [
                        { field: 'pytorch', type: 'nominal', title: 'PyTorch' },
                        { field: 'type', type: 'nominal', title: 'Backend' },
                        { field: 'backend', type: 'nominal', title: 'Version' },
                    ],
                },
            },
        };
    }, [filtered]);

    if (loading) {
        return (
            <HStack gap={3} p={8}>
                <Spinner size="md" />
                <Text>Fetching PyTorch wheel index...</Text>
            </HStack>
        );
    }

    if (error) {
        return (
            <Box p={4} bg="var(--panel-red-bg)" borderColor="var(--panel-red-border)" borderWidth="1px" borderRadius="md">
                <Text color="var(--panel-red-text)">Error: {error}</Text>
            </Box>
        );
    }

    return (
        <Box>
            <HStack mb={4} gap={4}>
                <Text fontSize="sm" color="var(--muted-text)">
                    {filtered.length} unique version×backend combinations parsed from the PyTorch wheel index.
                </Text>
                <HStack gap={2} as="label" cursor="pointer">
                    <input
                        type="checkbox"
                        checked={onlyV2}
                        onChange={(e) => setOnlyV2(e.target.checked)}
                    />
                    <Text fontSize="sm">PyTorch 2.0+ only</Text>
                </HStack>
            </HStack>
            {spec && <VegaPlot spec={spec} height="auto" />}

            {ranges.length > 0 && (
                <Box mt={8}>
                    <Heading size="md" mb={4} color="var(--heading-color)">
                        Support Ranges
                    </Heading>
                    <HStack gap={8} alignItems="flex-start" flexWrap="wrap">
                        {(['cuda', 'rocm', 'xpu'] as const).map(type => {
                            const typeRanges = ranges.filter(r => r.backendType === type);
                            if (typeRanges.length === 0) return null;
                            return (
                                <Box key={type}>
                                    <Text fontWeight="bold" mb={2} textTransform="uppercase" fontSize="sm">
                                        {type}
                                    </Text>
                                    <Table.Root size="sm" variant="outline">
                                        <Table.Header>
                                            <Table.Row>
                                                <Table.ColumnHeader>Version</Table.ColumnHeader>
                                                <Table.ColumnHeader>PyTorch Range</Table.ColumnHeader>
                                            </Table.Row>
                                        </Table.Header>
                                        <Table.Body>
                                            {typeRanges.map((r, i) => (
                                                <Table.Row key={i}>
                                                    <Table.Cell>{r.backendVersion}</Table.Cell>
                                                    <Table.Cell>
                                                        {r.from === r.to ? r.from : `${r.from} → ${r.to}`}
                                                    </Table.Cell>
                                                </Table.Row>
                                            ))}
                                        </Table.Body>
                                    </Table.Root>
                                </Box>
                            );
                        })}
                    </HStack>
                </Box>
            )}
        </Box>
    );
};

const PyTorchWheels: React.FC = () => {
    return (
        <VegaProvider>
            <Box p={6} maxW="1400px" mx="auto">
                <Heading size="lg" mb={2} color="var(--heading-color)">
                    PyTorch Wheel Availability
                </Heading>
                <Text fontSize="sm" color="var(--muted-text)" mb={6}>
                    GPU backend support matrix parsed from{' '}
                    <a href={PYTORCH_WHL_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
                        download.pytorch.org
                    </a>
                </Text>
                <PyTorchWheelsContent />
            </Box>
        </VegaProvider>
    );
};

export default PyTorchWheels;
