import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Button, Flex, Grid, Heading, HStack, Input, Text, VStack,
} from '@chakra-ui/react';
import { useColorModeValue } from '../ui/color-mode';
import { useParams, useNavigate } from 'react-router-dom';
import { jsonStore, isStaticMode } from '../../services/jsonstore';
import { Plus, Trash2, Copy, Save, FolderOpen } from 'lucide-react';

interface FilamentSpool {
  id: string;
  name: string;
  material: string;
  color: string;
  weightG: number;
  priceDollars: number;
}

interface PrintItem {
  id: string;
  objectName: string;
  spoolId: string;
  gramsPerUnit: number;
  units: number;
  printTimeMinutes: number;
  batchSize: number;
}

interface PrintCostData {
  spools: FilamentSpool[];
  items: PrintItem[];
  misprintMargin: number;
  designTimeHours: number;
  designTimeRate: number;
  opportunityCostPerMin: number;
  wearCostPerMin: number;
  plateChangeMinutes: number;
  operatorHoursPerDay: number;
}

const COLLECTION = 'print-cost';

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fmtDollars(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtGrams(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtTime(minutes: number): string {
  if (minutes <= 0) return '-';
  const d = Math.floor(minutes / (24 * 60));
  const h = Math.floor((minutes % (24 * 60)) / 60);
  const m = Math.round(minutes % 60);
  if (d > 0 && h === 0 && m === 0) return `${d}d`;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const MATERIALS = ['PLA', 'ABS', 'PETG', 'TPU', 'Nylon', 'ASA', 'PC', 'Other'];

const PrintCostEstimator: React.FC = () => {
  const { project: urlProject } = useParams<{ project?: string }>();
  const navigate = useNavigate();

  const [spools, setSpools] = useState<FilamentSpool[]>([]);
  const [items, setItems] = useState<PrintItem[]>([]);
  const [misprintMargin, setMisprintMargin] = useState(10);
  const [designTimeHours, setDesignTimeHours] = useState(0);
  const [designTimeRate, setDesignTimeRate] = useState(30);
  const [opportunityCostPerMin, setOpportunityCostPerMin] = useState(0);
  const [wearCostPerMin, setWearCostPerMin] = useState(0);
  const [plateChangeMinutes, setPlateChangeMinutes] = useState(5);
  const [operatorHoursPerDay, setOperatorHoursPerDay] = useState(8);

  const [projectName, setProjectName] = useState('');
  const [savedProjects, setSavedProjects] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const toolbarBg = useColorModeValue('gray.50', 'gray.800');
  const hx = {
    border: useColorModeValue('#e2e8f0', '#4a5568'),
    header: useColorModeValue('#edf2f7', '#2d3748'),
    altRow: useColorModeValue('#f7fafc', '#1e2430'),
    muted: useColorModeValue('#718096', '#a0aec0'),
    accent: useColorModeValue('#ebf8ff', '#1a365d'),
    summaryBg: useColorModeValue('#f0fff4', '#1a3020'),
  };

  // ── Dirty-tracking wrappers ──────────────────────────────

  const markDirty = useCallback(<T,>(setter: React.Dispatch<React.SetStateAction<T>>) => {
    return (value: T | ((prev: T) => T)) => {
      setter(value);
      setDirty(true);
    };
  }, []);

  const setSpoolsDirty = useMemo(() => markDirty(setSpools), [markDirty]);
  const setItemsDirty = useMemo(() => markDirty(setItems), [markDirty]);
  const setMisprintMarginDirty = useMemo(() => markDirty(setMisprintMargin), [markDirty]);
  const setDesignTimeHoursDirty = useMemo(() => markDirty(setDesignTimeHours), [markDirty]);
  const setDesignTimeRateDirty = useMemo(() => markDirty(setDesignTimeRate), [markDirty]);
  const setOpportunityCostPerMinDirty = useMemo(() => markDirty(setOpportunityCostPerMin), [markDirty]);
  const setWearCostPerMinDirty = useMemo(() => markDirty(setWearCostPerMin), [markDirty]);
  const setPlateChangeMinutesDirty = useMemo(() => markDirty(setPlateChangeMinutes), [markDirty]);
  const setOperatorHoursPerDayDirty = useMemo(() => markDirty(setOperatorHoursPerDay), [markDirty]);

  // ── Persistence ──────────────────────────────────────────

  const doLoadProject = useCallback(async (name: string) => {
    try {
      const data = await jsonStore.get<PrintCostData>(COLLECTION, name);
      setSpools(data.spools || []);
      setItems((data.items || []).map(i => ({
        ...i, printTimeMinutes: i.printTimeMinutes ?? 0, batchSize: i.batchSize ?? 1,
      })));
      setMisprintMargin(data.misprintMargin ?? 10);
      setDesignTimeHours(data.designTimeHours ?? 0);
      setDesignTimeRate(data.designTimeRate ?? 30);
      setOpportunityCostPerMin((data as any).opportunityCostPerMin ?? 0);
      setWearCostPerMin((data as any).wearCostPerMin ?? 0);
      setPlateChangeMinutes((data as any).plateChangeMinutes ?? 5);
      setOperatorHoursPerDay((data as any).operatorHoursPerDay ?? 8);
      setProjectName(name);
      setDirty(false);
    } catch {
      setSaveStatus('Load failed');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, []);

  useEffect(() => {
    jsonStore.list(COLLECTION).then(setSavedProjects).catch(() => {});
    if (urlProject) {
      doLoadProject(urlProject);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlProject]);

  const saveProject = async () => {
    const name = projectName.trim();
    if (!name) return;
    try {
      const data: PrintCostData = {
        spools, items, misprintMargin, designTimeHours, designTimeRate,
        opportunityCostPerMin, wearCostPerMin, plateChangeMinutes, operatorHoursPerDay,
      };
      await jsonStore.put(COLLECTION, name, data);
      setDirty(false);
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(null), 2000);
      if (!savedProjects.includes(name)) setSavedProjects(prev => [...prev, name].sort());
      navigate(`/scratch/print-cost/${encodeURIComponent(name)}`, { replace: true });
    } catch {
      setSaveStatus('Save failed');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const loadProject = (name: string) => {
    navigate(`/scratch/print-cost/${encodeURIComponent(name)}`);
  };

  // ── Spool CRUD ───────────────────────────────────────────

  const addSpool = () => {
    const s: FilamentSpool = {
      id: genId(), name: '', material: 'PLA', color: '',
      weightG: 1000, priceDollars: 25,
    };
    setSpoolsDirty(prev => [...prev, s]);
  };

  const updateSpool = (id: string, field: keyof FilamentSpool, value: string | number) => {
    setSpoolsDirty(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const deleteSpool = (id: string) => {
    setSpoolsDirty(prev => prev.filter(s => s.id !== id));
  };

  // ── Print item CRUD ──────────────────────────────────────

  const addItem = () => {
    const item: PrintItem = {
      id: genId(), objectName: '', spoolId: spools[0]?.id || '',
      gramsPerUnit: 0, units: 1, printTimeMinutes: 0, batchSize: 1,
    };
    setItemsDirty(prev => [...prev, item]);
  };

  const duplicateItem = (source: PrintItem) => {
    const item: PrintItem = { ...source, id: genId() };
    setItemsDirty(prev => [...prev, item]);
  };

  const updateItem = (id: string, field: keyof PrintItem, value: string | number) => {
    setItemsDirty(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const deleteItem = (id: string) => {
    setItemsDirty(prev => prev.filter(i => i.id !== id));
  };

  // ── Calculations ─────────────────────────────────────────

  const spoolMap = useMemo(() => {
    const map: Record<string, FilamentSpool> = {};
    for (const s of spools) map[s.id] = s;
    return map;
  }, [spools]);

  const costPerGram = (spool: FilamentSpool) =>
    spool.weightG > 0 ? spool.priceDollars / spool.weightG : 0;

  const itemFilamentCost = (item: PrintItem) => {
    const spool = spoolMap[item.spoolId];
    if (!spool) return 0;
    return item.gramsPerUnit * item.units * (1 + misprintMargin / 100) * costPerGram(spool);
  };

  const itemRuns = (item: PrintItem) => Math.ceil(item.units / Math.max(1, item.batchSize));
  const itemMachineTime = (item: PrintItem) => item.printTimeMinutes * item.units;

  const totalFilamentCost = items.reduce((sum, item) => sum + itemFilamentCost(item), 0);
  const designTimeCost = designTimeHours * designTimeRate;
  const totalPrintTimeMinutes = items.reduce((s, i) => s + itemMachineTime(i), 0);
  const totalRuns = items.reduce((s, i) => s + itemRuns(i), 0);
  const totalPlateChangeMinutes = totalRuns * plateChangeMinutes;
  const plateChangeCost = totalPlateChangeMinutes * (designTimeRate / 60);
  const opportunityCost = opportunityCostPerMin * totalPrintTimeMinutes;
  const wearCost = wearCostPerMin * totalPrintTimeMinutes;
  const grandTotal = totalFilamentCost + designTimeCost + plateChangeCost + opportunityCost + wearCost;

  const leadTime = useMemo(() => {
    const sessions: number[] = [];
    for (const item of items) {
      const runs = itemRuns(item);
      let remaining = item.units;
      for (let i = 0; i < runs; i++) {
        const unitsThisRun = Math.min(item.batchSize, remaining);
        sessions.push(item.printTimeMinutes * unitsThisRun);
        remaining -= unitsThisRun;
      }
    }
    if (sessions.length === 0) return null;

    const opDayMinutes = operatorHoursPerDay * 60;
    let clock = 0;

    for (const runTime of sessions) {
      const dayNum = Math.floor(clock / (24 * 60));
      const opEnd = dayNum * 24 * 60 + opDayMinutes;

      if (clock >= opEnd) {
        clock = (dayNum + 1) * 24 * 60;
      }

      clock += plateChangeMinutes;
      clock += runTime;
    }

    return {
      totalMinutes: clock,
      calendarDays: Math.ceil(clock / (24 * 60)),
      totalSessions: sessions.length,
    };
  }, [items, plateChangeMinutes, operatorHoursPerDay]);

  const objectSummary = useMemo(() => {
    const groups: Record<string, {
      variants: { spoolId: string; units: number; grams: number; cost: number; timeMinutes: number; runs: number }[];
      totalCost: number;
      totalGrams: number;
      totalUnits: number;
      totalTimeMinutes: number;
      totalRuns: number;
    }> = {};
    for (const item of items) {
      const name = item.objectName || '(unnamed)';
      if (!groups[name]) groups[name] = { variants: [], totalCost: 0, totalGrams: 0, totalUnits: 0, totalTimeMinutes: 0, totalRuns: 0 };
      const cost = itemFilamentCost(item);
      const grams = item.gramsPerUnit * item.units * (1 + misprintMargin / 100);
      const runs = itemRuns(item);
      const timeMinutes = item.printTimeMinutes * runs;
      groups[name].variants.push({ spoolId: item.spoolId, units: item.units, grams, cost, timeMinutes, runs });
      groups[name].totalCost += cost;
      groups[name].totalGrams += grams;
      groups[name].totalUnits += item.units;
      groups[name].totalTimeMinutes += timeMinutes;
      groups[name].totalRuns += runs;
    }
    return groups;
  }, [items, spoolMap, misprintMargin]);

  const spoolLabel = (id: string) => {
    const s = spoolMap[id];
    if (!s) return '(unknown)';
    return s.name || `${s.material} ${s.color}`.trim() || '(unnamed)';
  };

  // ── Styles ───────────────────────────────────────────────

  const thStyle: React.CSSProperties = {
    padding: '6px 8px', fontWeight: 600, fontSize: '12px', textAlign: 'left',
    background: hx.header, borderBottom: `2px solid ${hx.border}`,
    borderRight: `1px solid ${hx.border}`, whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    padding: '2px 6px', borderBottom: `1px solid ${hx.border}`,
    borderRight: `1px solid ${hx.border}`, fontSize: '13px',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'transparent', border: 'none', outline: 'none',
    color: 'inherit', fontSize: '13px', padding: '2px 0',
  };
  const numInputStyle: React.CSSProperties = {
    ...inputStyle, textAlign: 'right', fontFamily: 'monospace',
  };
  const numCellStyle: React.CSSProperties = {
    ...tdStyle, textAlign: 'right', fontFamily: 'monospace',
  };

  // ── Render ───────────────────────────────────────────────

  return (
    <Box h="100%" display="flex" flexDirection="column" bg={bgColor}>
      <Flex px={4} py={3} borderBottom="1px solid" borderColor={borderColor} align="center" flexShrink={0}>
        <Heading size="lg" flex={1}>3D Print Cost Estimator</Heading>
      </Flex>

      {/* Project toolbar */}
      <Box px={4} py={2} borderBottom="1px solid" borderColor={borderColor} bg={toolbarBg}>
        <Flex gap={3} align="center" wrap="wrap">
          {isStaticMode ? (
            <Text fontSize="sm" fontWeight="600">{projectName || 'No project'}</Text>
          ) : (
            <>
              <Input size="sm" placeholder="Project name" value={projectName}
                onChange={e => setProjectName(e.target.value)} w="200px" />
              <Button size="sm" onClick={saveProject} disabled={!projectName.trim()}>
                <Save size={14} /> Save
              </Button>
              {saveStatus && (
                <Text fontSize="sm" color={saveStatus === 'Saved' ? 'green.500' : 'red.400'}>{saveStatus}</Text>
              )}
              {dirty && !saveStatus && projectName.trim() && (
                <Text fontSize="xs" color="orange.400">unsaved changes</Text>
              )}
            </>
          )}
          {savedProjects.length > 0 && (
            <>
              <Box borderLeft="1px solid" borderColor="gray.300" h="24px" mx={1} />
              <FolderOpen size={14} />
              {savedProjects.map(name => (
                <Button key={name} size="xs" variant={name === projectName ? 'solid' : 'outline'}
                  onClick={() => loadProject(name)}>{name}</Button>
              ))}
            </>
          )}
        </Flex>
      </Box>

      <Box flex={1} overflow="auto" p={4}>
        <VStack align="stretch" gap={8} maxW="7xl" mx="auto">

          {/* ── Filament Spools ────────────────────────────── */}
          <Box>
            <HStack mb={2} gap={3}>
              <Heading size="md">Filament Spools</Heading>
              <Button size="sm" colorScheme="blue" onClick={addSpool}>
                <Plus size={14} />&nbsp;Add Spool
              </Button>
            </HStack>
            <Box overflowX="auto" borderWidth="1px" borderColor={borderColor} borderRadius="md">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, minWidth: '160px' }}>Name</th>
                    <th style={{ ...thStyle, width: '100px' }}>Material</th>
                    <th style={{ ...thStyle, width: '100px' }}>Color</th>
                    <th style={{ ...thStyle, width: '100px', textAlign: 'right' }}>Weight (g)</th>
                    <th style={{ ...thStyle, width: '100px', textAlign: 'right' }}>Price ($)</th>
                    <th style={{ ...thStyle, width: '90px', textAlign: 'right' }}>$/g</th>
                    <th style={{ ...thStyle, width: '36px' }} />
                  </tr>
                </thead>
                <tbody>
                  {spools.map((spool, idx) => (
                    <tr key={spool.id} style={{ background: idx % 2 ? hx.altRow : undefined }}>
                      <td style={tdStyle}>
                        <input value={spool.name} placeholder="Spool name"
                          onChange={e => updateSpool(spool.id, 'name', e.target.value)}
                          style={inputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <select value={spool.material}
                          onChange={e => updateSpool(spool.id, 'material', e.target.value)}
                          style={{ ...inputStyle, cursor: 'pointer' }}>
                          {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td style={tdStyle}>
                        <input value={spool.color} placeholder="Color"
                          onChange={e => updateSpool(spool.id, 'color', e.target.value)}
                          style={inputStyle} />
                      </td>
                      <td style={numCellStyle}>
                        <input type="number" value={spool.weightG} min={0}
                          onChange={e => updateSpool(spool.id, 'weightG', parseFloat(e.target.value) || 0)}
                          style={{ ...numInputStyle, width: '80px' }} />
                      </td>
                      <td style={numCellStyle}>
                        <input type="number" step="0.01" value={spool.priceDollars} min={0}
                          onChange={e => updateSpool(spool.id, 'priceDollars', parseFloat(e.target.value) || 0)}
                          style={{ ...numInputStyle, width: '80px' }} />
                      </td>
                      <td style={numCellStyle}>
                        {costPerGram(spool).toFixed(4)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', padding: '2px' }}>
                        <button onClick={() => deleteSpool(spool.id)} title="Delete spool"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: hx.muted, display: 'inline-flex' }}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {spools.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: hx.muted, padding: '20px' }}>
                        No spools yet. Add your filament spools to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Box>
          </Box>

          {/* ── Print Jobs ─────────────────────────────────── */}
          <Box>
            <HStack mb={2} gap={3}>
              <Heading size="md">Print Jobs</Heading>
              <Button size="sm" colorScheme="blue" onClick={addItem} disabled={spools.length === 0}>
                <Plus size={14} />&nbsp;Add Item
              </Button>
              {spools.length === 0 && (
                <Text fontSize="xs" color={mutedColor}>Add spools first</Text>
              )}
            </HStack>
            <Box overflowX="auto" borderWidth="1px" borderColor={borderColor} borderRadius="md">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, minWidth: '160px' }}>Object</th>
                    <th style={{ ...thStyle, minWidth: '180px' }}>Filament Spool</th>
                    <th style={{ ...thStyle, width: '90px', textAlign: 'right' }}>g / unit</th>
                    <th style={{ ...thStyle, width: '100px', textAlign: 'right' }}>Time / unit</th>
                    <th style={{ ...thStyle, width: '70px', textAlign: 'right' }}>Units</th>
                    <th style={{ ...thStyle, width: '60px', textAlign: 'right' }}>Batch</th>
                    <th style={{ ...thStyle, width: '60px', textAlign: 'right' }}>Runs</th>
                    <th style={{ ...thStyle, width: '100px', textAlign: 'right' }}>Raw (g)</th>
                    <th style={{ ...thStyle, width: '100px', textAlign: 'right' }}>Total Time</th>
                    <th style={{ ...thStyle, width: '110px', textAlign: 'right' }}>w/ Misprint (g)</th>
                    <th style={{ ...thStyle, width: '100px', textAlign: 'right' }}>Cost ($)</th>
                    <th style={{ ...thStyle, width: '60px' }} />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const baseG = item.gramsPerUnit * item.units;
                    const withMisprint = baseG * (1 + misprintMargin / 100);
                    const cost = itemFilamentCost(item);
                    return (
                      <tr key={item.id} style={{ background: idx % 2 ? hx.altRow : undefined }}>
                        <td style={tdStyle}>
                          <input value={item.objectName} placeholder="Object name"
                            onChange={e => updateItem(item.id, 'objectName', e.target.value)}
                            style={inputStyle} />
                        </td>
                        <td style={tdStyle}>
                          <select value={item.spoolId}
                            onChange={e => updateItem(item.id, 'spoolId', e.target.value)}
                            style={{ ...inputStyle, cursor: 'pointer' }}>
                            <option value="">-- Select spool --</option>
                            {spools.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.name || `${s.material} ${s.color}`.trim()} — ${fmtDollars(s.priceDollars)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={numCellStyle}>
                          <input type="number" step="0.1" min={0} value={item.gramsPerUnit}
                            onChange={e => updateItem(item.id, 'gramsPerUnit', parseFloat(e.target.value) || 0)}
                            style={{ ...numInputStyle, width: '70px' }} />
                        </td>
                        <td style={numCellStyle}>
                          <input type="number" step="1" min={0} value={item.printTimeMinutes}
                            onChange={e => updateItem(item.id, 'printTimeMinutes', parseFloat(e.target.value) || 0)}
                            style={{ ...numInputStyle, width: '70px' }} title="Minutes per unit" />
                        </td>
                        <td style={numCellStyle}>
                          <input type="number" min={1} value={item.units}
                            onChange={e => updateItem(item.id, 'units', parseInt(e.target.value) || 1)}
                            style={{ ...numInputStyle, width: '50px' }} />
                        </td>
                        <td style={numCellStyle}>
                          <input type="number" min={1} value={item.batchSize}
                            onChange={e => updateItem(item.id, 'batchSize', parseInt(e.target.value) || 1)}
                            style={{ ...numInputStyle, width: '40px' }} />
                        </td>
                        <td style={numCellStyle}>{itemRuns(item)}</td>
                        <td style={numCellStyle}>{fmtGrams(baseG)}</td>
                        <td style={numCellStyle}>{fmtTime(itemMachineTime(item))}</td>
                        <td style={numCellStyle}>{fmtGrams(withMisprint)}</td>
                        <td style={{ ...numCellStyle, fontWeight: 600 }}>{fmtDollars(cost)}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', padding: '2px', whiteSpace: 'nowrap' }}>
                          <button onClick={() => duplicateItem(item)} title="Duplicate (for color variant)"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: hx.muted, display: 'inline-flex' }}>
                            <Copy size={13} />
                          </button>
                          <button onClick={() => deleteItem(item.id)} title="Delete"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: hx.muted, display: 'inline-flex', marginLeft: '2px' }}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={12} style={{ ...tdStyle, textAlign: 'center', color: hx.muted, padding: '20px' }}>
                        No print items yet. Add objects you want to print.
                      </td>
                    </tr>
                  )}
                </tbody>
                {items.length > 0 && (
                  <tfoot>
                    <tr style={{ fontWeight: 600, background: hx.header }}>
                      <td style={{ ...tdStyle, borderTop: `2px solid ${hx.border}` }}>Total</td>
                      <td style={{ ...tdStyle, borderTop: `2px solid ${hx.border}` }} />
                      <td style={{ ...tdStyle, borderTop: `2px solid ${hx.border}` }} />
                      <td style={{ ...tdStyle, borderTop: `2px solid ${hx.border}` }} />
                      <td style={{ ...numCellStyle, borderTop: `2px solid ${hx.border}`, fontWeight: 600 }}>
                        {items.reduce((s, i) => s + i.units, 0)}
                      </td>
                      <td style={{ ...tdStyle, borderTop: `2px solid ${hx.border}` }} />
                      <td style={{ ...numCellStyle, borderTop: `2px solid ${hx.border}`, fontWeight: 600 }}>
                        {totalRuns}
                      </td>
                      <td style={{ ...numCellStyle, borderTop: `2px solid ${hx.border}`, fontWeight: 600 }}>
                        {fmtGrams(items.reduce((s, i) => s + i.gramsPerUnit * i.units, 0))}
                      </td>
                      <td style={{ ...numCellStyle, borderTop: `2px solid ${hx.border}`, fontWeight: 600 }}>
                        {fmtTime(totalPrintTimeMinutes)}
                      </td>
                      <td style={{ ...numCellStyle, borderTop: `2px solid ${hx.border}`, fontWeight: 600 }}>
                        {fmtGrams(items.reduce((s, i) => s + i.gramsPerUnit * i.units * (1 + misprintMargin / 100), 0))}
                      </td>
                      <td style={{ ...numCellStyle, borderTop: `2px solid ${hx.border}`, fontWeight: 600 }}>
                        {fmtDollars(totalFilamentCost)}
                      </td>
                      <td style={{ ...tdStyle, borderTop: `2px solid ${hx.border}` }} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </Box>
          </Box>

          {/* ── Config + Summary ────────────────────────────── */}
          <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={6}>

            {/* Margins */}
            <Box borderWidth="1px" borderColor={borderColor} borderRadius="md" p={4}>
              <Heading size="sm" mb={4}>Margins & Overhead</Heading>
              <VStack align="stretch" gap={4}>
                <Box>
                  <Text fontSize="sm" fontWeight={500} mb={1}>Misprint Margin (%)</Text>
                  <HStack gap={2}>
                    <Input type="number" step="1" min={0} value={misprintMargin}
                      onChange={e => setMisprintMarginDirty(parseFloat(e.target.value) || 0)}
                      size="sm" maxW="100px" />
                    {[5, 10, 15, 20].map(v => (
                      <Button key={v} size="xs"
                        variant={misprintMargin === v ? 'solid' : 'outline'}
                        colorScheme={misprintMargin === v ? 'blue' : undefined}
                        onClick={() => setMisprintMarginDirty(v)}>
                        {v}%
                      </Button>
                    ))}
                  </HStack>
                  <Text fontSize="xs" color={mutedColor} mt={1}>
                    Extra filament to account for failed prints
                  </Text>
                </Box>

                <Box>
                  <Text fontSize="sm" fontWeight={500} mb={1}>Design Time</Text>
                  <HStack gap={2} align="center">
                    <Input type="number" step="0.5" min={0} value={designTimeHours}
                      onChange={e => setDesignTimeHoursDirty(parseFloat(e.target.value) || 0)}
                      size="sm" maxW="80px" />
                    <Text fontSize="sm">hours ×</Text>
                    <Input type="number" step="1" min={0} value={designTimeRate}
                      onChange={e => setDesignTimeRateDirty(parseFloat(e.target.value) || 0)}
                      size="sm" maxW="80px" />
                    <Text fontSize="sm">$/hr</Text>
                    <Text fontSize="sm" fontWeight={600} fontFamily="monospace">
                      = ${fmtDollars(designTimeCost)}
                    </Text>
                  </HStack>
                  <Text fontSize="xs" color={mutedColor} mt={1}>
                    Time spent on CAD modeling, slicing, and prep
                  </Text>
                </Box>

                <Box>
                  <Text fontSize="sm" fontWeight={500} mb={1}>Opportunity Cost ($/min)</Text>
                  <HStack gap={2} align="center">
                    <Input type="number" step="0.001" min={0} value={opportunityCostPerMin}
                      onChange={e => setOpportunityCostPerMinDirty(parseFloat(e.target.value) || 0)}
                      size="sm" maxW="100px" />
                    <Text fontSize="sm" color={mutedColor}>
                      × {fmtTime(totalPrintTimeMinutes)} = ${fmtDollars(opportunityCost)}
                    </Text>
                  </HStack>
                  <Text fontSize="xs" color={mutedColor} mt={1}>
                    Value of printer time being occupied
                  </Text>
                </Box>

                <Box>
                  <Text fontSize="sm" fontWeight={500} mb={1}>Wear Cost ($/min)</Text>
                  <HStack gap={2} align="center">
                    <Input type="number" step="0.001" min={0} value={wearCostPerMin}
                      onChange={e => setWearCostPerMinDirty(parseFloat(e.target.value) || 0)}
                      size="sm" maxW="100px" />
                    <Text fontSize="sm" color={mutedColor}>
                      × {fmtTime(totalPrintTimeMinutes)} = ${fmtDollars(wearCost)}
                    </Text>
                  </HStack>
                  <Text fontSize="xs" color={mutedColor} mt={1}>
                    Machine wear, electricity, maintenance
                  </Text>
                </Box>

                <Box borderTop="1px solid" borderColor={borderColor} pt={3}>
                  <Text fontSize="sm" fontWeight={600} mb={2}>Lead Time Estimation</Text>
                </Box>

                <Box>
                  <Text fontSize="sm" fontWeight={500} mb={1}>Plate Change Time (min)</Text>
                  <Input type="number" step="1" min={0} value={plateChangeMinutes}
                    onChange={e => setPlateChangeMinutesDirty(parseFloat(e.target.value) || 0)}
                    size="sm" maxW="100px" />
                  <Text fontSize="xs" color={mutedColor} mt={1}>
                    Time to remove print, prep plate, and start next run
                  </Text>
                </Box>

                <Box>
                  <Text fontSize="sm" fontWeight={500} mb={1}>Operator Hours / Day</Text>
                  <HStack gap={2}>
                    <Input type="number" step="0.5" min={1} max={24} value={operatorHoursPerDay}
                      onChange={e => setOperatorHoursPerDayDirty(parseFloat(e.target.value) || 8)}
                      size="sm" maxW="80px" />
                    {[8, 12, 16, 24].map(v => (
                      <Button key={v} size="xs"
                        variant={operatorHoursPerDay === v ? 'solid' : 'outline'}
                        colorScheme={operatorHoursPerDay === v ? 'blue' : undefined}
                        onClick={() => setOperatorHoursPerDayDirty(v)}>
                        {v}h
                      </Button>
                    ))}
                  </HStack>
                  <Text fontSize="xs" color={mutedColor} mt={1}>
                    Plate changes can only happen during operator hours
                  </Text>
                </Box>
              </VStack>
            </Box>

            {/* Summary */}
            <Box borderWidth="1px" borderColor={borderColor} borderRadius="md" p={4}>
              <Heading size="sm" mb={4}>Cost Summary</Heading>
              <VStack align="stretch" gap={2}>
                <Flex justify="space-between" py={1}>
                  <Text fontSize="sm">Filament cost</Text>
                  <Text fontSize="sm" fontFamily="monospace" fontWeight={500}>
                    ${fmtDollars(totalFilamentCost)}
                  </Text>
                </Flex>
                {misprintMargin > 0 && (
                  <Text fontSize="xs" color={mutedColor} pl={2} mt={-1}>
                    includes {misprintMargin}% misprint margin
                  </Text>
                )}

                <Flex justify="space-between" py={1}>
                  <Text fontSize="sm">Design time</Text>
                  <Text fontSize="sm" fontFamily="monospace" fontWeight={500}>
                    ${fmtDollars(designTimeCost)}
                  </Text>
                </Flex>

                {totalPrintTimeMinutes > 0 && (
                  <Flex justify="space-between" py={1}>
                    <Text fontSize="sm">Total print time</Text>
                    <Text fontSize="sm" fontFamily="monospace" fontWeight={500}>
                      {fmtTime(totalPrintTimeMinutes)}
                    </Text>
                  </Flex>
                )}

                <Flex justify="space-between" py={1}>
                  <Text fontSize="sm">Opportunity cost</Text>
                  <Text fontSize="sm" fontFamily="monospace" fontWeight={500}>
                    ${fmtDollars(opportunityCost)}
                  </Text>
                </Flex>

                <Flex justify="space-between" py={1}>
                  <Text fontSize="sm">Wear cost</Text>
                  <Text fontSize="sm" fontFamily="monospace" fontWeight={500}>
                    ${fmtDollars(wearCost)}
                  </Text>
                </Flex>

                {totalRuns > 0 && (
                  <>
                    <Flex justify="space-between" py={1}>
                      <Text fontSize="sm">Plate changes ({totalRuns} × {plateChangeMinutes}m)</Text>
                      <Text fontSize="sm" fontFamily="monospace" fontWeight={500}>
                        ${fmtDollars(plateChangeCost)}
                      </Text>
                    </Flex>
                    <Text fontSize="xs" color={mutedColor} pl={2} mt={-1}>
                      {fmtTime(totalPlateChangeMinutes)} operator time @ ${fmtDollars(designTimeRate)}/hr
                    </Text>
                  </>
                )}

                <Box borderTop="2px solid" borderColor={borderColor} pt={2} mt={1}>
                  <Flex justify="space-between" py={1} background={hx.summaryBg} px={2} borderRadius="md">
                    <Text fontSize="md" fontWeight={700}>Grand Total</Text>
                    <Text fontSize="md" fontFamily="monospace" fontWeight={700}>
                      ${fmtDollars(grandTotal)}
                    </Text>
                  </Flex>
                </Box>

                {items.length > 0 && (
                  <Flex justify="space-between" py={1} px={2}>
                    <Text fontSize="sm" color={mutedColor}>
                      Per unit (avg across {items.reduce((s, i) => s + i.units, 0)} units)
                    </Text>
                    <Text fontSize="sm" fontFamily="monospace" color={mutedColor}>
                      ${fmtDollars(grandTotal / Math.max(1, items.reduce((s, i) => s + i.units, 0)))}
                    </Text>
                  </Flex>
                )}

                {leadTime && (
                  <Box mt={2} p={2} background={hx.accent} borderRadius="md">
                    <Text fontSize="sm" fontWeight={600} mb={1}>Lead Time Estimate</Text>
                    <Flex justify="space-between">
                      <Text fontSize="sm">Calendar days</Text>
                      <Text fontSize="sm" fontFamily="monospace" fontWeight={700}>
                        {leadTime.calendarDays} day{leadTime.calendarDays !== 1 ? 's' : ''}
                      </Text>
                    </Flex>
                    <Text fontSize="xs" color={mutedColor}>
                      {leadTime.totalSessions} print run{leadTime.totalSessions !== 1 ? 's' : ''} · {fmtTime(totalPrintTimeMinutes)} printing · {fmtTime(leadTime.totalSessions * plateChangeMinutes)} plate changes · {operatorHoursPerDay}h operator/day
                    </Text>
                  </Box>
                )}

                {/* Per-object breakdown */}
                {Object.keys(objectSummary).length > 0 && (
                  <Box mt={3}>
                    <Text fontSize="sm" fontWeight={600} mb={2}>Per Object Breakdown</Text>
                    {Object.entries(objectSummary).map(([name, data]) => (
                      <Box key={name} mb={2} pl={2} borderLeft="3px solid" borderColor={borderColor}>
                        <Flex justify="space-between">
                          <Text fontSize="sm" fontWeight={500}>{name}</Text>
                          <Text fontSize="sm" fontFamily="monospace" fontWeight={600}>
                            ${fmtDollars(data.totalCost)}
                          </Text>
                        </Flex>
                        <Text fontSize="xs" color={mutedColor}>
                          {data.totalUnits} units · {data.totalRuns} run{data.totalRuns !== 1 ? 's' : ''} · {fmtGrams(data.totalGrams)}g
                          {data.totalTimeMinutes > 0 && ` · ${fmtTime(data.totalTimeMinutes)}`}
                          {data.totalUnits > 0 && ` · $${fmtDollars(data.totalCost / data.totalUnits)}/unit`}
                        </Text>
                        {data.variants.length > 1 && data.variants.map((v, i) => (
                          <Text key={i} fontSize="xs" color={mutedColor} pl={2}>
                            {spoolLabel(v.spoolId)}: {v.units}× ({v.runs} run{v.runs !== 1 ? 's' : ''}) · ${fmtDollars(v.cost)}{v.timeMinutes > 0 && ` · ${fmtTime(v.timeMinutes)}`}
                          </Text>
                        ))}
                      </Box>
                    ))}
                  </Box>
                )}
              </VStack>
            </Box>
          </Grid>
        </VStack>
      </Box>
    </Box>
  );
};

export default PrintCostEstimator;
