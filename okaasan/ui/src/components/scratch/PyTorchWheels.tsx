import React, { useEffect, useMemo, useState } from 'react';
import { Box, Heading, Text, Spinner, HStack, Table, VStack, Badge, Tabs } from '@chakra-ui/react';
import { VegaProvider } from '../../contexts/VegaContext';
import VegaPlot from '../health/VegaPlot';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface WheelEntry {
    pytorchVersion: string;
    backendType: 'cuda' | 'rocm' | 'xpu';
    backendVersion: string;
}

interface PyGEntry {
    pytorchVersion: string;
    backendType: string;
    backendVersion: string;
}

interface VllmVersionInfo {
    version: string;
    torchReq: string | null;
    cudaVersions: string[];
    rocmVersions: string[];
}

interface AmdRepoResult {
    label: string;
    url: string;
    packages: string[];
    error?: string;
}

interface SupportRange {
    backendType: string;
    backendVersion: string;
    from: string;
    to: string;
}

interface SourceState<T> {
    data: T;
    loading: boolean;
    error: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const PYTORCH_WHL_URL = 'https://download.pytorch.org/whl/torch/';
const PYG_WHL_URL = 'https://data.pyg.org/whl';
const AMD_ROCM_SOURCES = [
    { label: 'ROCm 7.2.0 (pypi.amd.com)', url: 'https://pypi.amd.com/rocm-7.2.0/simple/' },
    { label: 'gfx950-dcgpu (repo.amd.com)', url: 'https://repo.amd.com/rocm/whl/gfx950-dcgpu/' },
];

// ─── Server-side proxy to bypass CORS ───────────────────────────────────────────

async function proxyFetch(url: string): Promise<string> {
    const resp = await fetch(`${API_BASE}/proxy/fetch?url=${encodeURIComponent(url)}`);
    if (!resp.ok) throw new Error(`Proxy ${resp.status}`);
    const data = await resp.json();
    return data.body;
}

async function proxyFetchJSON(url: string): Promise<any> {
    const body = await proxyFetch(url);
    return JSON.parse(body);
}

const LIBRARY_COLORS: Record<string, string> = {
    PyTorch: '#ee4c2c',
    PyG: '#3c78d8',
    vLLM: '#9b59b6',
};

// ─── Utilities ──────────────────────────────────────────────────────────────────

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

function parseBackend(raw: string): { type: 'cuda' | 'rocm' | 'xpu'; version: string } | null {
    const cuMatch = raw.match(/^cu(\d+)$/);
    if (cuMatch) {
        const digits = cuMatch[1];
        const major = digits.slice(0, -1);
        const minor = digits.slice(-1);
        return { type: 'cuda', version: `${parseInt(major)}.${minor}` };
    }
    const rocmMatch = raw.match(/^rocm([\d.]+)$/);
    if (rocmMatch) return { type: 'rocm', version: rocmMatch[1] };
    if (raw === 'xpu') return { type: 'xpu', version: 'xpu' };
    const xpuMatch = raw.match(/^xpu([\d.]+)$/);
    if (xpuMatch) return { type: 'xpu', version: xpuMatch[1] };
    return null;
}

function dedup<T>(items: T[], keyFn: (t: T) => string): T[] {
    const seen = new Set<string>();
    return items.filter(item => {
        const key = keyFn(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function computeSupportRanges(
    entries: { pytorchVersion: string; backendType: string; backendVersion: string }[],
): SupportRange[] {
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

// ─── PyTorch fetcher ────────────────────────────────────────────────────────────

function parsePyTorchLine(line: string): WheelEntry | null {
    const hrefMatch = line.match(/href="([^"]+)"/);
    if (!hrefMatch) return null;
    const pathMatch = hrefMatch[1].match(/\/whl\/([^/]+)\//);
    if (!pathMatch) return null;
    const backendSlug = pathMatch[1];
    if (backendSlug === 'cpu') return null;
    const backend = parseBackend(backendSlug);
    if (!backend) return null;
    const filenameMatch = line.match(/torch-([\d.]+(?:\.post\d+)?)/);
    if (!filenameMatch) return null;
    const rawVersion = filenameMatch[1].replace(/\.post\d+$/, '');
    return {
        pytorchVersion: rawVersion.split('.').slice(0, 3).join('.'),
        backendType: backend.type,
        backendVersion: backend.version,
    };
}

async function fetchPyTorchWheels(): Promise<WheelEntry[]> {
    const html = await proxyFetch(PYTORCH_WHL_URL);
    const parsed: WheelEntry[] = [];
    for (const line of html.split('\n')) {
        if (!line.includes('torch-')) continue;
        const entry = parsePyTorchLine(line);
        if (entry) parsed.push(entry);
    }
    return dedup(parsed, e => `${e.pytorchVersion}|${e.backendType}|${e.backendVersion}`);
}

// ─── PyG fetcher ────────────────────────────────────────────────────────────────

function parsePyGDirName(name: string): PyGEntry | null {
    // Index hrefs are URL-encoded (e.g. torch-2.4.0%2Bcu121.html)
    let decoded = name;
    try {
        decoded = decodeURIComponent(name);
    } catch { /* keep raw */ }
    decoded = decoded.replace(/\.html?$/i, '').split('/').pop() ?? decoded;

    const match = decoded.match(/torch-([\d.]+)(?:\+(.+))?/);
    if (!match) return null;
    const pytorchVersion = match[1];
    const backendRaw = match[2];
    if (!backendRaw || backendRaw === 'cpu')
        return { pytorchVersion, backendType: 'cpu', backendVersion: 'cpu' };
    const backend = parseBackend(backendRaw);
    if (!backend) return { pytorchVersion, backendType: backendRaw, backendVersion: backendRaw };
    return { pytorchVersion, backendType: backend.type, backendVersion: backend.version };
}

async function fetchPyGWheels(): Promise<PyGEntry[]> {
    const html = await proxyFetch(PYG_WHL_URL);
    const entries: PyGEntry[] = [];
    const hrefRegex = /href="([^"]*torch-[^"]+)"/gi;
    let m;
    while ((m = hrefRegex.exec(html)) !== null) {
        const entry = parsePyGDirName(m[1]);
        if (entry) entries.push(entry);
    }
    if (entries.length === 0) {
        for (const line of html.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('torch-')) {
                const entry = parsePyGDirName(trimmed);
                if (entry) entries.push(entry);
            }
        }
    }
    return dedup(entries, e => `${e.pytorchVersion}|${e.backendType}|${e.backendVersion}`);
}

// ─── vLLM fetcher (GitHub Releases API + PyPI for torch req) ────────────────────

const VLLM_GH_RELEASES_URL = 'https://api.github.com/repos/vllm-project/vllm/releases';

function extractTorchReq(requiresDist: string[] | null | undefined): string | null {
    if (!requiresDist) return null;
    for (const req of requiresDist) {
        const match = req.match(/^torch\s*(?:\(([^)]+)\)|([><=!~][^;,]*))/);
        if (match) return (match[1] || match[2]).trim();
    }
    return null;
}

function parseVllmBackends(
    assets: { name: string }[],
    body: string,
): { cuda: string[]; rocm: string[] } {
    const cudaSet = new Set<string>();
    const rocmSet = new Set<string>();

    // 1. Parse wheel asset filenames
    for (const a of assets) {
        if (!a.name.endsWith('.whl')) continue;
        const cuMatch = a.name.match(/\+cu(\d+)/);
        if (cuMatch) {
            const digits = cuMatch[1];
            const major = digits.slice(0, -1);
            const minor = digits.slice(-1);
            cudaSet.add(`${parseInt(major)}.${minor}`);
        }
        const rocmMatch = a.name.match(/\+rocm([\d.]+)/);
        if (rocmMatch) rocmSet.add(rocmMatch[1]);
        if (!a.name.includes('+') && a.name.startsWith('vllm-')) {
            cudaSet.add('default');
        }
    }

    // 2. Parse release notes body for ROCm/CUDA mentions not in assets
    //    Matches patterns like "ROCm 6.2", "ROCm 7.2.1", "rocm6.2.4"
    const rocmBodyMatches = body.matchAll(/[Rr][Oo][Cc][Mm]\s*([\d]+\.[\d]+(?:\.[\d]+)?)/g);
    for (const m of rocmBodyMatches) rocmSet.add(m[1]);

    // Also catch "CUDA 12.6", "CUDA 13.0" etc. from body when assets are bare
    if (cudaSet.size <= 1) {
        const cudaBodyMatches = body.matchAll(/CUDA\s+([\d]+\.[\d]+)/g);
        for (const m of cudaBodyMatches) {
            const v = m[1];
            if (parseFloat(v) >= 10) cudaSet.add(v);
        }
    }

    return {
        cuda: [...cudaSet].sort((a, b) => (a === 'default' ? 1 : b === 'default' ? -1 : versionSort(a, b))),
        rocm: [...rocmSet].sort(versionSort),
    };
}

async function fetchVllmVersions(): Promise<VllmVersionInfo[]> {
    type GhRelease = {
        tag_name: string;
        prerelease: boolean;
        draft: boolean;
        body: string;
        assets: { name: string }[];
    };
    const allReleases: GhRelease[] = [];
    for (let page = 1; page <= 5; page++) {
        try {
            const batch: GhRelease[] = await proxyFetchJSON(
                `${VLLM_GH_RELEASES_URL}?per_page=100&page=${page}`,
            );
            if (!Array.isArray(batch) || batch.length === 0) break;
            allReleases.push(...batch);
        } catch { break; }
    }
    if (allReleases.length === 0) throw new Error('No releases found');

    const stableReleases = allReleases.filter(
        r => !r.prerelease && !r.draft && /^v?\d+\.\d+/.test(r.tag_name),
    );

    const results = await Promise.all(
        stableReleases.map(async (rel): Promise<VllmVersionInfo> => {
            const version = rel.tag_name.replace(/^v/, '');
            const backends = parseVllmBackends(rel.assets, rel.body ?? '');
            let torchReq: string | null = null;
            try {
                const d = await proxyFetchJSON(`https://pypi.org/pypi/vllm/${version}/json`);
                torchReq = extractTorchReq(d.info?.requires_dist);
            } catch { /* best-effort */ }
            return { version, torchReq, cudaVersions: backends.cuda, rocmVersions: backends.rocm };
        }),
    );

    return results.sort((a, b) => versionSort(a.version, b.version));
}

// ─── AMD ROCm fetcher ───────────────────────────────────────────────────────────

async function fetchAmdRocm(): Promise<AmdRepoResult[]> {
    const results: AmdRepoResult[] = [];
    for (const { label, url } of AMD_ROCM_SOURCES) {
        try {
            const html = await proxyFetch(url);
            const packages: string[] = [];
            const hrefRegex = /href="([^"]+)"/gi;
            let m;
            while ((m = hrefRegex.exec(html)) !== null) {
                const name = m[1].replace(/\/$/, '').split('/').pop();
                if (name && !name.startsWith('.') && !name.startsWith('#')) packages.push(name);
            }
            if (packages.length === 0) {
                for (const line of html.split('\n')) {
                    const t = line.trim();
                    if (t && !t.startsWith('#') && !t.startsWith('<') && !t.startsWith('!') && t.length < 80)
                        packages.push(t);
                }
            }
            results.push({ label, url, packages });
        } catch (e: any) {
            results.push({ label, url, packages: [], error: e.message });
        }
    }
    return results;
}

// ─── Hook: multi-source fetcher ─────────────────────────────────────────────────

function useWheelData() {
    const [pytorch, setPytorch] = useState<SourceState<WheelEntry[]>>({ data: [], loading: true, error: null });
    const [pyg, setPyg] = useState<SourceState<PyGEntry[]>>({ data: [], loading: true, error: null });
    const [vllm, setVllm] = useState<SourceState<VllmVersionInfo[]>>({ data: [], loading: true, error: null });
    const [amd, setAmd] = useState<SourceState<AmdRepoResult[]>>({ data: [], loading: true, error: null });
    const [onlyV2, setOnlyV2] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetchPyTorchWheels()
            .then(d => !cancelled && setPytorch({ data: d, loading: false, error: null }))
            .catch(e => !cancelled && setPytorch({ data: [], loading: false, error: e.message }));
        fetchPyGWheels()
            .then(d => !cancelled && setPyg({ data: d, loading: false, error: null }))
            .catch(e => !cancelled && setPyg({ data: [], loading: false, error: e.message }));
        fetchVllmVersions()
            .then(d => !cancelled && setVllm({ data: d, loading: false, error: null }))
            .catch(e => !cancelled && setVllm({ data: [], loading: false, error: e.message }));
        fetchAmdRocm()
            .then(d => !cancelled && setAmd({ data: d, loading: false, error: null }))
            .catch(e => !cancelled && setAmd({ data: [], loading: false, error: e.message }));
        return () => { cancelled = true; };
    }, []);

    const filteredPytorch = useMemo(
        () => (onlyV2 ? pytorch.data.filter(e => versionSort(e.pytorchVersion, '2.0.0') >= 0) : pytorch.data),
        [pytorch.data, onlyV2],
    );
    const filteredPyG = useMemo(
        () => (onlyV2 ? pyg.data.filter(e => versionSort(e.pytorchVersion, '2.0.0') >= 0) : pyg.data),
        [pyg.data, onlyV2],
    );

    return { pytorch: { ...pytorch, data: filteredPytorch }, pyg: { ...pyg, data: filteredPyG }, vllm, amd, onlyV2, setOnlyV2 };
}

// ─── Status badge ───────────────────────────────────────────────────────────────

const SourceBadge: React.FC<{ loading: boolean; error: string | null; count: number; label: string }> = ({
    loading, error, count, label,
}) => (
    <Badge
        colorPalette={loading ? 'gray' : error ? 'red' : 'green'}
        variant="subtle"
        px={2}
        py={0.5}
    >
        {label}: {loading ? 'loading...' : error ? 'error' : `${count}`}
    </Badge>
);

// ─── Combined Compatibility Tab ─────────────────────────────────────────────────

const CompatibilityOverview: React.FC<{
    pytorch: WheelEntry[];
    pyg: PyGEntry[];
    vllm: VllmVersionInfo[];
}> = ({ pytorch, pyg, vllm }) => {
    const spec = useMemo(() => {
        if (pytorch.length === 0) return null;

        const cudaOnly = pytorch.filter(e => e.backendType === 'cuda');
        const pytorchVersions = [...new Set(cudaOnly.map(e => e.pytorchVersion))].sort(versionSort);

        const pygSet = new Set(
            pyg.filter(e => e.backendType === 'cuda').map(e => `${e.pytorchVersion}|${e.backendVersion}`),
        );

        // Build a set of CUDA versions that the latest vLLM actually ships wheels for
        const latestVllm = vllm.length > 0 ? vllm[vllm.length - 1] : null;
        const vllmMinTorch = latestVllm?.torchReq?.match(/>=\s*([\d.]+)/)?.[1] ?? null;
        const vllmCudaSet = new Set(latestVllm?.cudaVersions.filter(v => v !== 'default') ?? []);

        const data: { pytorch: string; backend: string; library: string }[] = [];
        for (const e of cudaOnly) {
            data.push({ pytorch: e.pytorchVersion, backend: e.backendVersion, library: 'PyTorch' });
            if (pygSet.has(`${e.pytorchVersion}|${e.backendVersion}`)) {
                data.push({ pytorch: e.pytorchVersion, backend: e.backendVersion, library: 'PyG' });
            }
            if (latestVllm) {
                const torchOk = !vllmMinTorch || versionSort(e.pytorchVersion, vllmMinTorch) >= 0;
                const cudaOk = vllmCudaSet.size === 0 || vllmCudaSet.has(e.backendVersion);
                if (torchOk && cudaOk) {
                    data.push({
                        pytorch: e.pytorchVersion,
                        backend: e.backendVersion,
                        library: `vLLM ${latestVllm.version}`,
                    });
                }
            }
        }

        const backends = [...new Set(cudaOnly.map(e => e.backendVersion))].sort(versionSort);

        return {
            $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
            autosize: { type: 'fit', contains: 'padding' },
            data: { values: data },
            width: { step: 28 },
            height: { step: 16 },
            mark: { type: 'circle', size: 40, opacity: 0.85 },
            encoding: {
                x: {
                    field: 'backend',
                    type: 'ordinal',
                    title: 'CUDA Version',
                    sort: backends,
                    axis: { labelAngle: -45 },
                },
                y: {
                    field: 'pytorch',
                    type: 'ordinal',
                    title: 'PyTorch Version',
                    sort: [...pytorchVersions].reverse(),
                },
                color: {
                    field: 'library',
                    type: 'nominal',
                    title: 'Library',
                    scale: {
                        domain: ['PyTorch', 'PyG', `vLLM ${latestVllm?.version ?? '?'}`],
                        range: [LIBRARY_COLORS.PyTorch, LIBRARY_COLORS.PyG, LIBRARY_COLORS.vLLM],
                    },
                },
                xOffset: { field: 'library', type: 'nominal' },
                tooltip: [
                    { field: 'pytorch', type: 'nominal', title: 'PyTorch' },
                    { field: 'backend', type: 'nominal', title: 'CUDA' },
                    { field: 'library', type: 'nominal', title: 'Library' },
                ],
            },
        };
    }, [pytorch, pyg, vllm]);

    if (!spec) return <Text color="var(--muted-text)">Waiting for data...</Text>;

    return (
        <Box>
            <Text fontSize="sm" color="var(--muted-text)" mb={4}>
                CUDA backend compatibility across PyTorch, PyTorch Geometric, and vLLM.
                Each dot indicates a wheel is available for that PyTorch + CUDA combination.
                vLLM dots are placed only where both the PyTorch version and CUDA version have published wheels.
            </Text>
            <VegaPlot spec={spec} height="auto" />
        </Box>
    );
};

// ─── PyTorch Tab ────────────────────────────────────────────────────────────────

const PyTorchTab: React.FC<{ entries: WheelEntry[] }> = ({ entries }) => {
    const ranges = useMemo(() => computeSupportRanges(entries), [entries]);

    const spec = useMemo(() => {
        if (entries.length === 0) return null;
        const pytorchVersions = [...new Set(entries.map(e => e.pytorchVersion))].sort(versionSort);
        const data = entries.map(e => ({
            pytorch: e.pytorchVersion,
            backend: e.backendVersion,
            type: e.backendType,
        }));
        return {
            $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
            autosize: { type: 'fit', contains: 'padding' },
            data: { values: data },
            facet: { row: { field: 'type', type: 'nominal', title: 'Backend Type' } },
            resolve: { scale: { y: 'independent' } },
            spec: {
                width: { step: 18 },
                height: 200,
                mark: { type: 'circle', size: 40, opacity: 0.85 },
                encoding: {
                    x: {
                        field: 'pytorch',
                        type: 'ordinal',
                        title: 'PyTorch Version',
                        sort: pytorchVersions,
                        axis: { labelAngle: -45 },
                    },
                    y: { field: 'backend', type: 'ordinal', title: 'Backend Version', sort: { field: 'backend', order: 'descending' } },
                    color: {
                        field: 'type',
                        type: 'nominal',
                        title: 'Backend',
                        scale: { domain: ['cuda', 'rocm', 'xpu'], range: ['#76b900', '#ed1c24', '#0071c5'] },
                    },
                    tooltip: [
                        { field: 'pytorch', type: 'nominal', title: 'PyTorch' },
                        { field: 'type', type: 'nominal', title: 'Backend' },
                        { field: 'backend', type: 'nominal', title: 'Version' },
                    ],
                },
            },
        };
    }, [entries]);

    return (
        <Box>
            <Text fontSize="sm" color="var(--muted-text)" mb={4}>
                {entries.length} unique version x backend combinations from{' '}
                <a href={PYTORCH_WHL_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
                    download.pytorch.org
                </a>
            </Text>
            {spec && <VegaPlot spec={spec} height="auto" />}
            {ranges.length > 0 && <RangesTable ranges={ranges} types={['cuda', 'rocm', 'xpu']} />}
        </Box>
    );
};

// ─── PyG Tab ────────────────────────────────────────────────────────────────────

const PyGTab: React.FC<{ entries: PyGEntry[] }> = ({ entries }) => {
    const cudaEntries = useMemo(() => entries.filter(e => e.backendType === 'cuda'), [entries]);
    const ranges = useMemo(() => computeSupportRanges(cudaEntries), [cudaEntries]);

    const spec = useMemo(() => {
        if (cudaEntries.length === 0) return null;
        const pytorchVersions = [...new Set(cudaEntries.map(e => e.pytorchVersion))].sort(versionSort);
        const backends = [...new Set(cudaEntries.map(e => e.backendVersion))].sort(versionSort);
        const data = cudaEntries.map(e => ({
            pytorch: e.pytorchVersion,
            cuda: e.backendVersion,
        }));
        return {
            $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
            autosize: { type: 'fit', contains: 'padding' },
            data: { values: data },
            width: { step: 18 },
            height: { step: 18 },
            mark: { type: 'circle', size: 40, opacity: 0.85, color: LIBRARY_COLORS.PyG },
            encoding: {
                x: {
                    field: 'pytorch',
                    type: 'ordinal',
                    title: 'PyTorch Version',
                    sort: pytorchVersions,
                    axis: { labelAngle: -45 },
                },
                y: {
                    field: 'cuda',
                    type: 'ordinal',
                    title: 'CUDA Version',
                    sort: [...backends].reverse(),
                },
                tooltip: [
                    { field: 'pytorch', type: 'nominal', title: 'PyTorch' },
                    { field: 'cuda', type: 'nominal', title: 'CUDA' },
                ],
            },
        };
    }, [cudaEntries]);

    return (
        <Box>
            <Text fontSize="sm" color="var(--muted-text)" mb={4}>
                {entries.length} PyTorch + backend combinations with PyG wheels at{' '}
                <a href={PYG_WHL_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
                    data.pyg.org/whl
                </a>
            </Text>
            {spec && <VegaPlot spec={spec} height="auto" />}
            {ranges.length > 0 && <RangesTable ranges={ranges} types={['cuda']} />}
        </Box>
    );
};

// ─── vLLM Tab ───────────────────────────────────────────────────────────────────

const VllmTab: React.FC<{ versions: VllmVersionInfo[] }> = ({ versions }) => {
    const cudaSpec = useMemo(() => {
        const data: { vllm: string; cuda: string }[] = [];
        for (const v of versions) {
            for (const c of v.cudaVersions) {
                if (c !== 'default') data.push({ vllm: v.version, cuda: c });
            }
        }
        if (data.length === 0) return null;

        const vllmVersions = versions.map(v => v.version);
        const cudaVersions = [...new Set(data.map(d => d.cuda))].sort(versionSort);

        return {
            $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
            autosize: { type: 'fit', contains: 'padding' },
            data: { values: data },
            width: { step: 18 },
            height: { step: 18 },
            mark: { type: 'circle', size: 40, opacity: 0.85 },
            encoding: {
                x: {
                    field: 'vllm',
                    type: 'ordinal',
                    title: 'vLLM Version',
                    sort: vllmVersions,
                    axis: { labelAngle: -45 },
                },
                y: {
                    field: 'cuda',
                    type: 'ordinal',
                    title: 'CUDA Version',
                    sort: [...cudaVersions].reverse(),
                },
                color: { value: LIBRARY_COLORS.vLLM },
                tooltip: [
                    { field: 'vllm', type: 'nominal', title: 'vLLM' },
                    { field: 'cuda', type: 'nominal', title: 'CUDA' },
                ],
            },
        };
    }, [versions]);

    const rocmSpec = useMemo(() => {
        const data: { vllm: string; rocm: string }[] = [];
        for (const v of versions) {
            for (const r of v.rocmVersions) data.push({ vllm: v.version, rocm: r });
        }
        if (data.length === 0) return null;

        const vllmVersions = versions.map(v => v.version);
        const rocmVersions = [...new Set(data.map(d => d.rocm))].sort(versionSort);

        return {
            $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
            autosize: { type: 'fit', contains: 'padding' },
            data: { values: data },
            width: { step: 18 },
            height: { step: 18 },
            mark: { type: 'circle', size: 40, opacity: 0.85 },
            encoding: {
                x: {
                    field: 'vllm',
                    type: 'ordinal',
                    title: 'vLLM Version',
                    sort: vllmVersions,
                    axis: { labelAngle: -45 },
                },
                y: {
                    field: 'rocm',
                    type: 'ordinal',
                    title: 'ROCm Version',
                    sort: [...rocmVersions].reverse(),
                },
                color: { value: '#ed1c24' },
                tooltip: [
                    { field: 'vllm', type: 'nominal', title: 'vLLM' },
                    { field: 'rocm', type: 'nominal', title: 'ROCm' },
                ],
            },
        };
    }, [versions]);

    return (
        <Box>
            <Text fontSize="sm" color="var(--muted-text)" mb={4}>
                vLLM wheel CUDA/ROCm versions parsed from{' '}
                <a href="https://github.com/vllm-project/vllm/releases" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
                    GitHub release assets
                </a>
                . PyTorch requirements from{' '}
                <a href="https://pypi.org/project/vllm/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
                    PyPI
                </a>.
            </Text>

            {cudaSpec && (
                <Box mb={6}>
                    <Heading size="sm" mb={3} color="var(--heading-color)">CUDA Wheels</Heading>
                    <VegaPlot spec={cudaSpec} height="auto" />
                </Box>
            )}

            {rocmSpec && (
                <Box mb={6}>
                    <Heading size="sm" mb={3} color="var(--heading-color)">ROCm Wheels</Heading>
                    <VegaPlot spec={rocmSpec} height="auto" />
                </Box>
            )}

            <Box mt={4}>
                <Heading size="sm" mb={3} color="var(--heading-color)">Details by Version</Heading>
                <Table.Root size="sm" variant="outline">
                    <Table.Header>
                        <Table.Row>
                            <Table.ColumnHeader>vLLM</Table.ColumnHeader>
                            <Table.ColumnHeader>torch</Table.ColumnHeader>
                            <Table.ColumnHeader>CUDA</Table.ColumnHeader>
                            <Table.ColumnHeader>ROCm</Table.ColumnHeader>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {[...versions].reverse().map(v => (
                            <Table.Row key={v.version}>
                                <Table.Cell fontFamily="mono" fontSize="sm">{v.version}</Table.Cell>
                                <Table.Cell fontFamily="mono" fontSize="sm">
                                    {v.torchReq ?? <Text as="span" color="var(--muted-text)">—</Text>}
                                </Table.Cell>
                                <Table.Cell fontSize="sm">
                                    {v.cudaVersions.length > 0 ? (
                                        <HStack gap={1} flexWrap="wrap">
                                            {v.cudaVersions.map(c => (
                                                <Badge key={c} colorPalette="green" variant="subtle" fontSize="xs">
                                                    {c}
                                                </Badge>
                                            ))}
                                        </HStack>
                                    ) : <Text as="span" color="var(--muted-text)">—</Text>}
                                </Table.Cell>
                                <Table.Cell fontSize="sm">
                                    {v.rocmVersions.length > 0 ? (
                                        <HStack gap={1} flexWrap="wrap">
                                            {v.rocmVersions.map(r => (
                                                <Badge key={r} colorPalette="red" variant="subtle" fontSize="xs">
                                                    {r}
                                                </Badge>
                                            ))}
                                        </HStack>
                                    ) : <Text as="span" color="var(--muted-text)">—</Text>}
                                </Table.Cell>
                            </Table.Row>
                        ))}
                    </Table.Body>
                </Table.Root>
            </Box>
        </Box>
    );
};

// ─── AMD ROCm Tab ───────────────────────────────────────────────────────────────

const AmdRocmTab: React.FC<{ results: AmdRepoResult[] }> = ({ results }) => (
    <Box>
        <Text fontSize="sm" color="var(--muted-text)" mb={4}>
            Package indices from AMD ROCm repositories. These provide ROCm-optimized builds of
            PyTorch and related libraries for AMD GPUs (MI300X, MI355X, gfx950, etc.).
        </Text>
        <VStack gap={6} align="stretch">
            {results.map((r, i) => (
                <Box key={i} p={4} bg="var(--card-bg)" borderWidth="1px" borderColor="var(--border-color)" borderRadius="md">
                    <HStack mb={2}>
                        <Heading size="sm" color="var(--heading-color)">{r.label}</Heading>
                        <Badge colorPalette={r.error ? 'red' : 'green'} variant="subtle">
                            {r.error ? `Error: ${r.error}` : `${r.packages.length} packages`}
                        </Badge>
                    </HStack>
                    <Text fontSize="xs" color="var(--muted-text)" mb={3}>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
                            {r.url}
                        </a>
                    </Text>
                    {r.packages.length > 0 && (
                        <HStack flexWrap="wrap" gap={2}>
                            {r.packages.map((pkg, j) => {
                                const isML = ['torch', 'torchvision', 'torchaudio', 'triton', 'pytorch-triton-rocm', 'jaxlib', 'jax-rocm7-pjrt', 'jax-rocm7-plugin', 'vllm'].includes(pkg);
                                return (
                                    <Badge
                                        key={j}
                                        colorPalette={isML ? 'red' : 'gray'}
                                        variant={isML ? 'solid' : 'subtle'}
                                        fontSize="xs"
                                    >
                                        {pkg}
                                    </Badge>
                                );
                            })}
                        </HStack>
                    )}
                    {r.error && r.packages.length === 0 && (
                        <Text fontSize="sm" color="var(--panel-red-text)">
                            Could not fetch this index (likely CORS restriction). Visit the URL directly to browse packages.
                        </Text>
                    )}
                </Box>
            ))}
        </VStack>
        <Box mt={6} p={4} bg="var(--panel-blue-bg)" borderColor="var(--panel-blue-border)" borderWidth="1px" borderRadius="md">
            <Text fontSize="sm" color="var(--panel-blue-text)">
                <strong>Note:</strong> ROCm builds of PyTorch are also available on the standard PyTorch wheel index
                (see PyTorch tab). The AMD repos above provide additional optimized packages for specific GPU architectures
                like gfx950 (MI355X) with ROCm 7.2+.
            </Text>
        </Box>
    </Box>
);

// ─── Shared Ranges Table ────────────────────────────────────────────────────────

const RangesTable: React.FC<{ ranges: SupportRange[]; types: string[] }> = ({ ranges, types }) => (
    <Box mt={8}>
        <Heading size="md" mb={4} color="var(--heading-color)">Support Ranges</Heading>
        <HStack gap={8} alignItems="flex-start" flexWrap="wrap">
            {types.map(type => {
                const typeRanges = ranges.filter(r => r.backendType === type);
                if (typeRanges.length === 0) return null;
                return (
                    <Box key={type}>
                        <Text fontWeight="bold" mb={2} textTransform="uppercase" fontSize="sm">{type}</Text>
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
                                        <Table.Cell>{r.from === r.to ? r.from : `${r.from} → ${r.to}`}</Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table.Root>
                    </Box>
                );
            })}
        </HStack>
    </Box>
);

// ─── Main Component ─────────────────────────────────────────────────────────────

const PyTorchWheelsContent: React.FC = () => {
    const { pytorch, pyg, vllm, amd, onlyV2, setOnlyV2 } = useWheelData();
    const [activeTab, setActiveTab] = useState('overview');

    const allLoading = pytorch.loading && pyg.loading && vllm.loading && amd.loading;

    if (allLoading) {
        return (
            <HStack gap={3} p={8}>
                <Spinner size="md" />
                <Text>Fetching wheel indices...</Text>
            </HStack>
        );
    }

    return (
        <Box>
            <HStack mb={4} gap={3} flexWrap="wrap">
                <HStack gap={2} as="label" cursor="pointer">
                    <input type="checkbox" checked={onlyV2} onChange={e => setOnlyV2(e.target.checked)} />
                    <Text fontSize="sm">PyTorch 2.0+ only</Text>
                </HStack>
                <SourceBadge loading={pytorch.loading} error={pytorch.error} count={pytorch.data.length} label="PyTorch" />
                <SourceBadge loading={pyg.loading} error={pyg.error} count={pyg.data.length} label="PyG" />
                <SourceBadge loading={vllm.loading} error={vllm.error} count={vllm.data.length} label="vLLM" />
                <SourceBadge loading={amd.loading} error={amd.error} count={amd.data.length} label="AMD ROCm" />
            </HStack>

            <Tabs.Root value={activeTab} onValueChange={(e: { value: string }) => setActiveTab(e.value)} size="sm">
                <Tabs.List mb={4}>
                    <Tabs.Trigger value="overview">Compatibility</Tabs.Trigger>
                    <Tabs.Trigger value="pytorch">PyTorch</Tabs.Trigger>
                    <Tabs.Trigger value="pyg">PyG</Tabs.Trigger>
                    <Tabs.Trigger value="vllm">vLLM</Tabs.Trigger>
                    <Tabs.Trigger value="amd">AMD ROCm</Tabs.Trigger>
                </Tabs.List>

                <Tabs.Content value="overview">
                    {pytorch.error ? (
                        <ErrorBox message={pytorch.error} />
                    ) : (
                        <CompatibilityOverview
                            pytorch={pytorch.data}
                            pyg={pyg.data}
                            vllm={vllm.data}
                        />
                    )}
                </Tabs.Content>

                <Tabs.Content value="pytorch">
                    {pytorch.error ? <ErrorBox message={pytorch.error} /> : <PyTorchTab entries={pytorch.data} />}
                </Tabs.Content>

                <Tabs.Content value="pyg">
                    {pyg.error ? <ErrorBox message={pyg.error} /> : <PyGTab entries={pyg.data} />}
                </Tabs.Content>

                <Tabs.Content value="vllm">
                    {vllm.error ? <ErrorBox message={vllm.error} /> : (
                        <VllmTab versions={vllm.data} />
                    )}
                </Tabs.Content>

                <Tabs.Content value="amd">
                    {amd.error ? <ErrorBox message={amd.error} /> : <AmdRocmTab results={amd.data} />}
                </Tabs.Content>
            </Tabs.Root>
        </Box>
    );
};

const ErrorBox: React.FC<{ message: string }> = ({ message }) => (
    <Box p={4} bg="var(--panel-red-bg)" borderColor="var(--panel-red-border)" borderWidth="1px" borderRadius="md">
        <Text color="var(--panel-red-text)">Error: {message}</Text>
    </Box>
);

const PyTorchWheels: React.FC = () => (
    <VegaProvider>
        <Box p={6} maxW="1400px" mx="auto">
            <Heading size="lg" mb={2} color="var(--heading-color)">
                ML Library Wheel Compatibility
            </Heading>
            <Text fontSize="sm" color="var(--muted-text)" mb={6}>
                Cross-library compatibility matrix for PyTorch, PyTorch Geometric, vLLM, and AMD ROCm
                — parsed live from upstream wheel indices and PyPI.
            </Text>
            <PyTorchWheelsContent />
        </Box>
    </VegaProvider>
);

export default PyTorchWheels;
