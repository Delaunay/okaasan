import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import {
  Box, Button, Flex, Heading, HStack, Input, Text, VStack,
} from '@chakra-ui/react';
import { useColorModeValue } from './ui/color-mode';
import { jsonStore } from '../services/jsonstore';
import {
  Plus, Save, Trash2, Download, Upload,
  ChevronUp, ChevronDown, ArrowUpDown, FileText, X,
} from 'lucide-react';

interface BudgetEntry {
  id: string;
  date: string;
  amount: number;
  type: string;
  from: string;
  bank: string;
  details: string;
  adjustment: number;
  comment: string;
}

interface ExpenseCategory {
  id: string;
  name: string;
  icon: string;
  taxDeductible: boolean;
  notes: string;
}

interface BudgetData {
  entries: BudgetEntry[];
  taxTypes: Record<string, 'taxable' | 'deductible'>;
}

type Tab = 'entries' | 'summary' | 'tax' | 'types' | 'from' | 'bank' | 'details';
type SortDir = 'asc' | 'desc';

interface SortConfig {
  column: string;
  direction: SortDir;
}

interface ColumnDef {
  key: string;
  label: string;
  width: string;
  type: 'date' | 'number' | 'text' | 'computed';
  editable: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: 'date',       label: 'Date',       width: '100px', type: 'date',     editable: true },
  { key: 'amount',     label: 'Amount',     width: '110px', type: 'number',   editable: true },
  { key: 'comment',    label: 'Comment',    width: '200px', type: 'text',     editable: true },
  { key: 'type',       label: 'Type',       width: '120px', type: 'text',     editable: true },
  { key: 'from',       label: 'From',       width: '140px', type: 'text',     editable: true },
  { key: 'bank',       label: 'Bank',       width: '120px', type: 'text',     editable: true },
  { key: 'details',    label: 'Details',    width: '200px', type: 'text',     editable: true },
  { key: 'adjustment', label: 'Adjustment', width: '110px', type: 'number',   editable: true },
  { key: 'adjusted',   label: 'Adjusted',   width: '110px', type: 'computed', editable: false },
];

const EDITABLE_COLS = COLUMNS.filter(c => c.editable);
const SUGGEST_COLS = new Set(['from', 'bank', 'details']);

const ADJUSTMENT_OPTIONS = [
  { value: 1.0,   label: 'None' },
  { value: 1.0/(1.0+0.05+0.0975), label: 'Remove Taxes' },
  { value: (1.0+0.05+0.0975), label: 'Add Taxes' },
];

const CATEGORY_ICONS: Record<string, string> = {
  'income': '💰', 'grocery': '🛒', 'daily-necessity': '🏪',
  'eat-out-norm': '🍽️', 'eat-out-biz': '🍽️',
  'outfits-norm': '👔', 'outfits-biz': '👔',
  'instrument': '🎵', 'entertainment': '🎭', 'medical': '🏥',
  'transport-biz': '🚌', 'transport': '🚌',
  'utility': '⚡', 'rent': '🏠', 'work-tool': '💻',
  'travel': '✈️', 'training': '📚', 'prof-fee': '📋',
  'art-events': '🎨', 'gst': '💲',
  'buying-others': '🎁', 'friend-reimburse': '🤝',
};

const COLLECTION = 'budget-sheet';

const DEFAULT_CATEGORIES: ExpenseCategory[] = [
  { id: 'income',          name: 'Income',                   icon: '💰', taxDeductible: false, notes: '' },
  { id: 'grocery',         name: 'Grocery',                  icon: '🛒', taxDeductible: false, notes: '' },
  { id: 'daily-necessity', name: 'Daily necessity',          icon: '🏪', taxDeductible: false, notes: '' },
  { id: 'eat-out-norm',    name: 'Eat out (norm)',           icon: '🍽️', taxDeductible: false, notes: '' },
  { id: 'eat-out-biz',     name: 'Eat out (Business)',       icon: '🍽️', taxDeductible: true,  notes: 'On work day, 50% of cost' },
  { id: 'outfits-norm',    name: 'Outfits (norm)',           icon: '👔', taxDeductible: false, notes: '' },
  { id: 'outfits-biz',     name: 'Outfits (Business)',       icon: '👔', taxDeductible: true,  notes: '' },
  { id: 'instrument',      name: 'Instrument',               icon: '🎵', taxDeductible: true,  notes: 'Repair, strings, purchase new bow, etc.' },
  { id: 'entertainment',   name: 'Entertainment',            icon: '🎭', taxDeductible: false, notes: '' },
  { id: 'medical',         name: 'Medical expense',          icon: '🏥', taxDeductible: true,  notes: 'Doctor, Dental, Massage, Spa, etc.' },
  { id: 'transport-biz',   name: 'Transportation (Business)',icon: '🚌', taxDeductible: true,  notes: 'STM, Car rental' },
  { id: 'transport',       name: 'Transportation',           icon: '🚌', taxDeductible: false, notes: '' },
  { id: 'utility',         name: 'Utility',                  icon: '⚡', taxDeductible: true,  notes: 'Phone plan, wifi, Hydro' },
  { id: 'rent',            name: 'Rent',                     icon: '🏠', taxDeductible: true,  notes: '' },
  { id: 'work-tool',       name: 'Work tool',                icon: '💻', taxDeductible: true,  notes: 'Computer, iPad, etc.' },
  { id: 'travel',          name: 'Travel',                   icon: '✈️', taxDeductible: true,  notes: '' },
  { id: 'training',        name: 'Training cost',            icon: '📚', taxDeductible: true,  notes: 'Lesson, learning skill' },
  { id: 'prof-fee',        name: 'Professional fee',         icon: '📋', taxDeductible: true,  notes: 'Guild fee, Accountant fee' },
  { id: 'art-events',      name: 'Art related events',       icon: '🎨', taxDeductible: true,  notes: 'Concerts, Museum, etc.' },
  { id: 'gst',             name: 'GST',                      icon: '💲', taxDeductible: false, notes: '' },
  { id: 'buying-others',   name: 'Buying For Others',        icon: '🎁', taxDeductible: false, notes: '' },
  { id: 'friend-reimburse',name: 'Friend Reimbursed',        icon: '🤝', taxDeductible: false, notes: '' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function emptyEntry(): BudgetEntry {
  return {
    id: genId(),
    date: new Date().toISOString().slice(0, 10),
    amount: 0, type: '', from: '', bank: '',
    details: '', adjustment: 1, comment: '',
  };
}

function adjusted(e: BudgetEntry): number {
  return e.amount * e.adjustment;
}

function fmtNum(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cellVal(e: BudgetEntry, key: string): string | number {
  if (key === 'adjusted') return adjusted(e);
  return (e as any)[key] ?? '';
}

function cmpCell(a: any, b: any, type: string): number {
  if (type === 'number' || type === 'computed')
    return (Number(a) || 0) - (Number(b) || 0);
  return String(a).localeCompare(String(b));
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === ',') { result.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// ── CSV mapping ────────────────────────────────────────────

interface CsvMappingProfile {
  name: string;
  columnMap: Record<string, string>;
  dateFormat: string;
  defaultBank: string;
  skipRows: number;
}

interface CsvImportState {
  allLines: string[];
  skipRows: number;
  headers: string[];
  rows: string[][];
  columnMap: Record<string, string>;
  dateFormat: string;
  bank: string;
  selectedProfile: string;
  preview: { date: string; amount: number; from: string; details: string; comment: string; valid: boolean; selected: boolean }[];
}

const DATE_FORMATS = [
  'YYYY-MM-DD', 'YYYY/MM/DD', 'YYYYMMDD',
  'DD/MM/YYYY', 'MM/DD/YYYY',
  'DD-MM-YYYY', 'MM-DD-YYYY',
  'DD.MM.YYYY',
];

const CSV_TARGET_FIELDS = [
  { key: '', label: '-- skip --' },
  { key: 'date', label: 'Date' },
  { key: 'amount', label: 'Amount' },
  { key: 'from', label: 'From' },
  { key: 'bank', label: 'Bank' },
  { key: 'details', label: 'Details' },
  { key: 'comment', label: 'Comment' },
];

function parseDateWithFormat(raw: string, fmt: string): string {
  const s = raw.trim();
  let d = 0, m = 0, y = 0;
  if (fmt === 'YYYYMMDD') {
    const digits = s.replace(/\D/g, '');
    if (digits.length === 8) { y = +digits.slice(0, 4); m = +digits.slice(4, 6); d = +digits.slice(6, 8); }
  } else if (fmt === 'YYYY-MM-DD' || fmt === 'YYYY/MM/DD') {
    const p = s.split(/[-/]/);
    if (p.length === 3) { y = +p[0]; m = +p[1]; d = +p[2]; }
  } else if (fmt === 'DD/MM/YYYY' || fmt === 'DD-MM-YYYY' || fmt === 'DD.MM.YYYY') {
    const p = s.split(/[-/.]/);
    if (p.length === 3) { d = +p[0]; m = +p[1]; y = +p[2]; }
  } else if (fmt === 'MM/DD/YYYY' || fmt === 'MM-DD-YYYY') {
    const p = s.split(/[-/]/);
    if (p.length === 3) { m = +p[0]; d = +p[1]; y = +p[2]; }
  }
  if (y < 100) y += 2000;
  if (y > 0 && m > 0 && m <= 12 && d > 0 && d <= 31) {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return '';
}

const BudgetSheet: React.FC = () => {
  const [entries, setEntries]           = useState<BudgetEntry[]>([]);
  const [activeTab, setActiveTab]       = useState<Tab>('entries');
  const [sort, setSort]                 = useState<SortConfig>({ column: 'date', direction: 'asc' });
  const [displayYear, setDisplayYear]   = useState<string>('');
  const [filters, setFilters]           = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');
  const [editing, setEditing]           = useState<{ row: string; col: string } | null>(null);
  const [editVal, setEditVal]           = useState('');
  const [saveStatus, setSaveStatus]     = useState<'' | 'saving' | 'saved'>('');
  const [fileName, setFileName]         = useState('default');
  const [fileList, setFileList]         = useState<string[]>([]);
  const [showFiles, setShowFiles]       = useState(false);
  const [taxTypes, setTaxTypes]         = useState<Record<string, 'taxable' | 'deductible'>>({});
  const [categories, setCategories]     = useState<ExpenseCategory[]>([]);
  const [summaryYear, setSummaryYear]   = useState(new Date().getFullYear());
  const [addingCat, setAddingCat]       = useState(false);
  const [addCatForRow, setAddCatForRow] = useState<string | null>(null);
  const [newCatName, setNewCatName]     = useState('');
  const [newCatDeduct, setNewCatDeduct] = useState(false);
  const [newCatNotes, setNewCatNotes]   = useState('');
  const [suggestIdx, setSuggestIdx]     = useState(-1);
  const [editingCat, setEditingCat]     = useState<{ id: string; field: string } | null>(null);
  const [editCatVal, setEditCatVal]     = useState('');
  const [valueLists, setValueLists]     = useState<Record<string, string[]>>({});
  const [addingListVal, setAddingListVal] = useState(false);
  const [newListVal, setNewListVal]     = useState('');
  const [csvImport, setCsvImport]       = useState<CsvImportState | null>(null);
  const [csvProfiles, setCsvProfiles]   = useState<CsvMappingProfile[]>([]);

  const saveRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveStatusRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const blurRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const phantomRef = useRef<BudgetEntry>(emptyEntry());

  // Hex colors for inline styles on HTML table elements
  const hx = {
    border:  useColorModeValue('#e2e8f0', '#4a5568'),
    header:  useColorModeValue('#edf2f7', '#2d3748'),
    altRow:  useColorModeValue('#f7fafc', '#1e2430'),
    active:  useColorModeValue('#ebf8ff', '#1a365d'),
    filter:  useColorModeValue('#f7fafc', '#171923'),
    income:  useColorModeValue('#276749', '#68d391'),
    expense: useColorModeValue('#c53030', '#fc8181'),
    muted:   useColorModeValue('#718096', '#a0aec0'),
    incomeBg: useColorModeValue('#e6f7ff', '#1a2f40'),
    netBg:    useColorModeValue('#f6ffed', '#1a3020'),
  };

  // Chakra tokens for Chakra components
  const bgColor     = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const headerBg    = useColorModeValue('gray.100', 'gray.700');
  const mutedColor  = useColorModeValue('gray.500', 'gray.400');

  // ── Data persistence ──────────────────────────────────────

  const loadData = useCallback(async (name: string) => {
    try {
      const data = await jsonStore.get<BudgetData>(COLLECTION, name);
      setEntries(data.entries || []);
      setTaxTypes(data.taxTypes || {});
    } catch {
      setEntries([]);
      setTaxTypes({});
    }
  }, []);

  const loadFiles = useCallback(async () => {
    try {
      const all = await jsonStore.list(COLLECTION);
      setFileList(all.filter(f => !f.startsWith('_')));
    } catch { setFileList([]); }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const cats = await jsonStore.get<ExpenseCategory[]>(COLLECTION, '_categories');
      if (cats && cats.length > 0) { setCategories(cats); return; }
    } catch {}
    try {
      const cats = await jsonStore.get<ExpenseCategory[]>('budget-categories', 'default');
      if (cats && cats.length > 0) {
        setCategories(cats);
        await jsonStore.put(COLLECTION, '_categories', cats);
        return;
      }
    } catch {}
    await jsonStore.put(COLLECTION, '_categories', DEFAULT_CATEGORIES);
    setCategories(DEFAULT_CATEGORIES);
  }, []);

  const loadValueLists = useCallback(async () => {
    try {
      const data = await jsonStore.get<Record<string, string[]>>(COLLECTION, '_value-lists');
      setValueLists(data || {});
    } catch {
      setValueLists({});
    }
  }, []);

  const saveValueLists = async (updated: Record<string, string[]>) => {
    setValueLists(updated);
    await jsonStore.put(COLLECTION, '_value-lists', updated);
  };

  const loadCsvProfiles = useCallback(async () => {
    try {
      const p = await jsonStore.get<CsvMappingProfile[]>(COLLECTION, '_csv-profiles');
      if (p) setCsvProfiles(p);
    } catch {}
  }, []);

  useEffect(() => { loadData(fileName); loadFiles(); }, [fileName, loadData, loadFiles]);
  useEffect(() => { loadCategories(); loadValueLists(); loadCsvProfiles(); }, [loadCategories, loadValueLists, loadCsvProfiles]);

  const scheduleSave = useCallback((ents: BudgetEntry[], tax: Record<string, 'taxable' | 'deductible'>) => {
    if (saveRef.current) clearTimeout(saveRef.current);
    if (saveStatusRef.current) clearTimeout(saveStatusRef.current);
    saveRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await jsonStore.put(COLLECTION, fileName, { entries: ents, taxTypes: tax });
        setSaveStatus('saved');
        saveStatusRef.current = setTimeout(() => setSaveStatus(''), 1500);
      } catch (err) {
        console.error('Save failed:', err);
        setSaveStatus('');
      }
    }, 800);
  }, [fileName]);

  const manualSave = async () => {
    setSaveStatus('saving');
    try {
      await jsonStore.put(COLLECTION, fileName, { entries, taxTypes });
      setSaveStatus('saved');
      loadFiles();
      setTimeout(() => setSaveStatus(''), 1500);
    } catch { setSaveStatus(''); }
  };

  // ── Entry CRUD ────────────────────────────────────────────

  const addEntry = () => {
    const ne = emptyEntry();
    const updated = [...entries, ne];
    setEntries(updated);
    scheduleSave(updated, taxTypes);
    setEditing({ row: ne.id, col: 'date' });
    setEditVal(ne.date);
  };

  const deleteEntry = (id: string) => {
    const updated = entries.filter(e => e.id !== id);
    setEntries(updated);
    scheduleSave(updated, taxTypes);
  };

  const updateEntry = (id: string, key: string, value: string) => {
    const updated = entries.map(e => {
      if (e.id !== id) return e;
      const col = COLUMNS.find(c => c.key === key);
      if (col?.type === 'number') return { ...e, [key]: parseFloat(value) || 0 };
      return { ...e, [key]: value };
    });
    setEntries(updated);
    scheduleSave(updated, taxTypes);
  };

  // ── Categories ───────────────────────────────────────────

  const saveCategories = async (cats: ExpenseCategory[]) => {
    setCategories(cats);
    await jsonStore.put(COLLECTION, '_categories', cats);
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const name = newCatName.trim();
    const newCat: ExpenseCategory = {
      id: genId(), name, icon: '📌', taxDeductible: newCatDeduct, notes: newCatNotes.trim(),
    };
    const updatedCats = [...categories, newCat];
    await saveCategories(updatedCats);
    if (addCatForRow) updateEntry(addCatForRow, 'type', name);
    setNewCatName(''); setNewCatDeduct(false); setNewCatNotes('');
    setAddingCat(false); setAddCatForRow(null);
  };

  const startCatEdit = (id: string, field: string, currentVal: string) => {
    setEditingCat({ id, field });
    setEditCatVal(currentVal);
  };

  const commitCatEdit = async (id: string, field: string) => {
    const cat = categories.find(c => c.id === id);
    if (!cat) { setEditingCat(null); return; }
    const val = editCatVal.trim();
    if (field === 'name' && val && val !== cat.name) {
      const oldName = cat.name;
      const updatedEntries = entries.map(e => e.type === oldName ? { ...e, type: val } : e);
      setEntries(updatedEntries);
      scheduleSave(updatedEntries, taxTypes);
    }
    const updated = categories.map(c => c.id === id ? { ...c, [field]: field === 'name' ? val : editCatVal } : c);
    await saveCategories(updated);
    setEditingCat(null);
  };

  const commitListItemEdit = async (columnKey: string, idx: number) => {
    const values = [...(valueLists[columnKey] || [])];
    const oldVal = values[idx];
    const newVal = editCatVal.trim();
    if (!newVal) { setEditingCat(null); return; }
    if (newVal !== oldVal) {
      const updatedEntries = entries.map(e =>
        (e as any)[columnKey] === oldVal ? { ...e, [columnKey]: newVal } : e
      );
      setEntries(updatedEntries);
      scheduleSave(updatedEntries, taxTypes);
      values[idx] = newVal;
      await saveValueLists({ ...valueLists, [columnKey]: values });
    }
    setEditingCat(null);
  };

  // ── Cell editing ──────────────────────────────────────────

  useLayoutEffect(() => {
    if (!editing && !editingCat) return;
    if (editing?.col === 'type' || editing?.col === 'adjustment') {
      selectRef.current?.focus();
    } else if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing, editingCat]);

  const commitEdit = () => {
    if (editing) {
      updateEntry(editing.row, editing.col, editVal);
      setEditing(null);
    }
  };

  const deferBlur = () => {
    clearTimeout(blurRef.current);
    blurRef.current = setTimeout(() => commitEdit(), 0);
  };

  const cancelBlur = () => {
    clearTimeout(blurRef.current);
  };

  const startEdit = (rowId: string, colKey: string) => {
    cancelBlur();
    const col = COLUMNS.find(c => c.key === colKey);
    if (!col?.editable) return;
    if (editing) {
      updateEntry(editing.row, editing.col, editVal);
    }
    let entry = entries.find(e => e.id === rowId);
    if (!entry && rowId === phantomRef.current.id) {
      const phantom = phantomRef.current;
      const updated = [...entries, phantom];
      setEntries(updated);
      scheduleSave(updated, taxTypes);
      phantomRef.current = emptyEntry();
      entry = phantom;
    }
    if (!entry) return;
    setEditing({ row: rowId, col: colKey });
    setEditVal(String(cellVal(entry, colKey)));
    setSuggestIdx(-1);
  };

  const categoryIcons = useMemo(() => {
    const map: Record<string, string> = {};
    for (const cat of categories) {
      map[cat.name] = cat.icon || CATEGORY_ICONS[cat.id] || '📌';
    }
    return map;
  }, [categories]);

  const filterOptions = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const key of ['type', 'from', 'bank', 'details']) {
      const unique = new Set<string>();
      for (const e of entries) {
        const val = String(cellVal(e, key));
        if (val) unique.add(val);
      }
      result[key] = Array.from(unique).sort();
    }
    return result;
  }, [entries]);

  const sortedFiltered = useMemo((): BudgetEntry[] => {
    let result = [...entries];
    if (dateFrom) result = result.filter(e => e.date >= dateFrom);
    if (dateTo) result = result.filter(e => e.date <= dateTo);
    for (const [key, fv] of Object.entries(filters)) {
      if (!fv) continue;
      if (filterOptions[key]) {
        result = result.filter(e => String(cellVal(e, key)) === fv);
      } else {
        const lower = fv.toLowerCase();
        result = result.filter(e => String(cellVal(e, key)).toLowerCase().includes(lower));
      }
    }
    if (sort.column) {
      const col = COLUMNS.find(c => c.key === sort.column);
      result.sort((a, b) => {
        const cmp = cmpCell(cellVal(a, sort.column), cellVal(b, sort.column), col?.type || 'text');
        return sort.direction === 'desc' ? -cmp : cmp;
      });
    }
    return result;
  }, [entries, filters, sort, filterOptions, dateFrom, dateTo]);

  const displayedEntries = useMemo((): BudgetEntry[] => {
    if (displayYear) {
      return sortedFiltered.filter(e => e.date.startsWith(displayYear));
    }
    if (sortedFiltered.length <= 50) return sortedFiltered;
    return sortedFiltered.slice(-50);
  }, [sortedFiltered, displayYear]);

  const availableDisplayYears = useMemo(() => {
    const ys = new Set<string>();
    for (const e of sortedFiltered) {
      const y = e.date.slice(0, 4);
      if (y && y.length === 4) ys.add(y);
    }
    return Array.from(ys).sort();
  }, [sortedFiltered]);

  const suggestions = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const key of ['from', 'bank', 'details']) {
      const managed = valueLists[key] || [];
      const fromEntries = new Set<string>();
      for (const e of entries) {
        const val = (e as any)[key];
        if (val && typeof val === 'string' && val.trim()) fromEntries.add(val.trim());
      }
      const all = new Set([...managed, ...fromEntries]);
      result[key] = Array.from(all).sort((a, b) => a.localeCompare(b));
    }
    return result;
  }, [entries, valueLists]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!editing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
      const idx = displayedEntries.findIndex(en => en.id === editing.row);
      if (idx < displayedEntries.length - 1) startEdit(displayedEntries[idx + 1].id, editing.col);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commitEdit();
      const colIdx = EDITABLE_COLS.findIndex(c => c.key === editing.col);
      const rowIdx = displayedEntries.findIndex(en => en.id === editing.row);
      if (e.shiftKey) {
        if (colIdx > 0) startEdit(editing.row, EDITABLE_COLS[colIdx - 1].key);
        else if (rowIdx > 0) startEdit(displayedEntries[rowIdx - 1].id, EDITABLE_COLS[EDITABLE_COLS.length - 1].key);
      } else {
        if (colIdx < EDITABLE_COLS.length - 1) startEdit(editing.row, EDITABLE_COLS[colIdx + 1].key);
        else if (rowIdx < displayedEntries.length - 1) startEdit(displayedEntries[rowIdx + 1].id, EDITABLE_COLS[0].key);
      }
    } else if (e.key === 'Escape') {
      setEditing(null);
    }
  };

  // ── Sort & filter ─────────────────────────────────────────

  const toggleSort = (column: string) => {
    setSort(prev => {
      if (prev.column === column) {
        return prev.direction === 'asc'
          ? { column, direction: 'desc' }
          : { column: '', direction: 'asc' };
      }
      return { column, direction: 'asc' };
    });
  };

  const hasFilters = Object.values(filters).some(v => v.length > 0) || !!dateFrom || !!dateTo;

  // ── CSV export / import ───────────────────────────────────

  const exportCSV = () => {
    const headers = COLUMNS.map(c => c.label);
    const rows = entries.map(e =>
      COLUMNS.map(c => {
        const v = String(cellVal(e, c.key));
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      })
    );
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `budget-${fileName}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const importCSV = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.csv';
    input.onchange = async (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const allLines = text.split('\n').filter(l => l.trim());
      if (allLines.length < 2) return;
      openCsvImport(allLines, 0);
    };
    input.click();
  };

  const saveCsvProfiles = async (profiles: CsvMappingProfile[]) => {
    setCsvProfiles(profiles);
    await jsonStore.put(COLLECTION, '_csv-profiles', profiles);
  };

  const buildCsvPreview = (rows: string[][], headers: string[], columnMap: Record<string, string>, dateFormat: string) => {
    return rows.map(row => {
      const mapped: Record<string, string> = {};
      headers.forEach((h, i) => {
        const target = columnMap[h];
        if (target && row[i] !== undefined) mapped[target] = row[i];
      });
      const date = mapped.date ? parseDateWithFormat(mapped.date, dateFormat) : '';
      const rawAmt = (mapped.amount || '').replace(/[$\s,]/g, '');
      const amount = parseFloat(rawAmt);
      const valid = date !== '' && !isNaN(amount);
      return {
        date,
        amount: isNaN(amount) ? 0 : amount,
        from: mapped.from || '',
        details: mapped.details || '',
        comment: mapped.comment || '',
        valid,
        selected: valid,
      };
    });
  };

  const autoMapHeader = (h: string): string => {
    const hl = h.toLowerCase();
    if (hl.includes('date')) return 'date';
    if (hl.includes('amount') || hl.includes('total') || hl.includes('sum')
      || hl.includes('debit') || hl.includes('credit') || hl.includes('withdrawal')
      || hl.includes('deposit') || hl.includes('montant') || hl.includes('prix')) return 'amount';
    if (hl.includes('description') || hl.includes('from') || hl.includes('payee')
      || hl.includes('name') || hl.includes('merchant') || hl.includes('vendor')) return 'from';
    if (hl.includes('detail') || hl.includes('memo') || hl.includes('note')) return 'details';
    if (hl.includes('comment')) return 'comment';
    if (hl.includes('bank') || hl.includes('account')) return 'bank';
    return '';
  };

  const openCsvImport = (allLines: string[], skipRows: number) => {
    const effective = allLines.slice(skipRows);
    if (effective.length < 2) return;
    const headers = parseCSVLine(effective[0]);
    const rows = effective.slice(1).map(l => parseCSVLine(l));

    const defaultMap: Record<string, string> = {};
    for (const h of headers) defaultMap[h] = autoMapHeader(h);

    const dateFormat = 'YYYY-MM-DD';
    const preview = buildCsvPreview(rows, headers, defaultMap, dateFormat);
    setCsvImport({ allLines, skipRows, headers, rows, columnMap: defaultMap, dateFormat, bank: '', selectedProfile: '', preview });
  };

  const updateCsvMapping = (field: 'columnMap' | 'dateFormat' | 'bank' | 'selectedProfile' | 'skipRows', value: any) => {
    if (!csvImport) return;
    if (field === 'skipRows') {
      const skip = value as number;
      const effective = csvImport.allLines.slice(skip);
      if (effective.length < 1) return;
      const headers = parseCSVLine(effective[0]);
      const rows = effective.slice(1).map(l => parseCSVLine(l));
      const columnMap: Record<string, string> = {};
      for (const h of headers) {
        columnMap[h] = csvImport.columnMap[h] ?? autoMapHeader(h);
      }
      const preview = buildCsvPreview(rows, headers, columnMap, csvImport.dateFormat);
      setCsvImport({ ...csvImport, skipRows: skip, headers, rows, columnMap, preview });
      return;
    }
    const next = { ...csvImport, [field]: value };
    if (field === 'columnMap' || field === 'dateFormat') {
      const map = field === 'columnMap' ? value : csvImport.columnMap;
      const fmt = field === 'dateFormat' ? value : csvImport.dateFormat;
      next.preview = buildCsvPreview(csvImport.rows, csvImport.headers, map, fmt);
    }
    setCsvImport(next);
  };

  const applyCsvProfile = (profileName: string) => {
    if (!csvImport) return;
    const profile = csvProfiles.find(p => p.name === profileName);
    if (profile) {
      const skip = profile.skipRows || 0;
      const effective = csvImport.allLines.slice(skip);
      if (effective.length < 2) return;
      const headers = parseCSVLine(effective[0]);
      const rows = effective.slice(1).map(l => parseCSVLine(l));
      const columnMap: Record<string, string> = {};
      for (const h of headers) {
        columnMap[h] = profile.columnMap[h] || '';
      }
      const preview = buildCsvPreview(rows, headers, columnMap, profile.dateFormat);
      setCsvImport({
        ...csvImport,
        skipRows: skip,
        headers,
        rows,
        columnMap,
        dateFormat: profile.dateFormat,
        bank: profile.defaultBank,
        selectedProfile: profileName,
        preview,
      });
    } else {
      updateCsvMapping('selectedProfile', '');
    }
  };

  const saveCsvProfile = () => {
    if (!csvImport) return;
    const name = prompt('Profile name:');
    if (!name) return;
    const profile: CsvMappingProfile = {
      name,
      columnMap: csvImport.columnMap,
      dateFormat: csvImport.dateFormat,
      defaultBank: csvImport.bank,
      skipRows: csvImport.skipRows,
    };
    const updated = csvProfiles.filter(p => p.name !== name);
    updated.push(profile);
    saveCsvProfiles(updated);
    updateCsvMapping('selectedProfile', name);
  };

  const deleteCsvProfile = () => {
    if (!csvImport || !csvImport.selectedProfile) return;
    const updated = csvProfiles.filter(p => p.name !== csvImport.selectedProfile);
    saveCsvProfiles(updated);
    updateCsvMapping('selectedProfile', '');
  };

  const confirmCsvImport = () => {
    if (!csvImport) return;
    const selected = csvImport.preview.filter(r => r.selected);
    const imported: BudgetEntry[] = selected.map(r => ({
      id: genId(),
      date: r.date,
      amount: Math.abs(r.amount),
      type: '',
      from: r.from,
      bank: csvImport.bank || '',
      details: r.details,
      adjustment: 1,
      comment: r.comment,
    }));
    const updated = [...entries, ...imported];
    setEntries(updated);
    scheduleSave(updated, taxTypes);
    setCsvImport(null);
  };

  // ── Pivot data (Summary & Tax) ──────────────────────────────

  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const e of entries) {
      const y = parseInt(e.date.slice(0, 4));
      if (!isNaN(y)) ys.add(y);
    }
    return Array.from(ys).sort();
  }, [entries]);

  const pivotData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) =>
      `${summaryYear}-${String(i + 1).padStart(2, '0')}`
    );

    const income: Record<string, number> = {};
    const byType: Record<string, Record<string, number>> = {};

    for (const e of entries) {
      const m = e.date.slice(0, 7);
      if (!months.includes(m)) continue;
      const adj = adjusted(e);
      const type = e.type || '(no type)';

      if (type === 'Income') {
        income[m] = (income[m] || 0) + adj;
      } else {
        if (!byType[type]) byType[type] = {};
        byType[type][m] = (byType[type][m] || 0) + adj;
      }
    }

    const catNames = categories.filter(c => c.name !== 'Income').map(c => c.name);
    const extra = Object.keys(byType).filter(t => !catNames.includes(t)).sort();
    const expenseTypes = [...catNames, ...extra];

    return { months, income, byType, expenseTypes };
  }, [entries, summaryYear, categories]);

  const toggleCategoryTax = async (catId: string) => {
    const updated = categories.map(c =>
      c.id === catId ? { ...c, taxDeductible: !c.taxDeductible } : c
    );
    await saveCategories(updated);
  };

  // ── Render helpers ────────────────────────────────────────

  const SortIcon = ({ col }: { col: string }) => {
    if (sort.column !== col) return <ArrowUpDown size={12} style={{ opacity: 0.3 }} />;
    return sort.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  const renderCell = (entry: BudgetEntry, col: ColumnDef) => {
    const isEditing = editing?.row === entry.id && editing?.col === col.key;
    if (isEditing) {
      if (col.key === 'type') {
        return (
          <select
            ref={selectRef}
            value={editVal}
            onChange={e => {
              const v = e.target.value;
              if (v === '__add_new__') {
                setAddingCat(true);
                setAddCatForRow(entry.id);
              } else {
                updateEntry(entry.id, 'type', v);
              }
              setEditing(null);
            }}
            onBlur={deferBlur}
            style={{
              width: '100%', padding: '2px 4px', height: '26px', fontSize: '13px',
              border: `1px solid ${hx.active}`, borderRadius: '2px',
              background: 'transparent', color: 'inherit', outline: 'none',
              boxSizing: 'border-box', cursor: 'pointer',
            }}
          >
            <option value="">-- Select --</option>
            {categories.map(c => (
              <option key={c.id} value={c.name}>
                {c.icon || CATEGORY_ICONS[c.id] || '📌'} {c.name}{c.taxDeductible ? ' ✔' : ''}
              </option>
            ))}
            <option value="__add_new__">+ Add new…</option>
          </select>
        );
      }
      if (SUGGEST_COLS.has(col.key)) {
        const allSuggestions = suggestions[col.key] || [];
        const filtered = editVal
          ? allSuggestions.filter(s => s.toLowerCase().includes(editVal.toLowerCase()) && s !== editVal)
          : allSuggestions;
        return (
          <div style={{ position: 'relative' }}>
            <input
              ref={inputRef}
              value={editVal}
              type="text"
              onChange={e => { setEditVal(e.target.value); setSuggestIdx(-1); }}
              onBlur={deferBlur}
              onKeyDown={e => {
                if (filtered.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSuggestIdx(prev => Math.min(prev + 1, filtered.length - 1));
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSuggestIdx(prev => Math.max(prev - 1, -1));
                    return;
                  }
                  if (e.key === 'Enter' && suggestIdx >= 0 && suggestIdx < filtered.length) {
                    e.preventDefault();
                    updateEntry(entry.id, col.key, filtered[suggestIdx]);
                    setEditing(null);
                    setSuggestIdx(-1);
                    return;
                  }
                }
                handleKeyDown(e);
              }}
              style={{
                width: '100%', padding: '2px 4px', height: '26px', fontSize: '13px',
                border: `1px solid ${hx.active}`, borderRadius: '2px',
                background: 'transparent', color: 'inherit', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {filtered.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                maxHeight: '160px', overflowY: 'auto',
                border: `1px solid ${hx.border}`,
                background: hx.header,
                zIndex: 10, borderRadius: '0 0 4px 4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              }}>
                {filtered.map((s, i) => (
                  <div
                    key={s}
                    onMouseDown={e => {
                      e.preventDefault();
                      cancelBlur();
                      updateEntry(entry.id, col.key, s);
                      setEditing(null);
                      setSuggestIdx(-1);
                    }}
                    onMouseEnter={() => setSuggestIdx(i)}
                    style={{
                      padding: '4px 8px', fontSize: '12px', cursor: 'pointer',
                      background: i === suggestIdx ? hx.active : undefined,
                    }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }
      if (col.key === 'adjustment') {
        return (
          <select
            ref={selectRef}
            value={String(editVal)}
            onChange={e => {
              updateEntry(entry.id, 'adjustment', e.target.value);
              setEditing(null);
            }}
            onBlur={deferBlur}
            style={{
              width: '100%', padding: '2px 4px', height: '26px', fontSize: '13px',
              border: `1px solid ${hx.active}`, borderRadius: '2px',
              background: 'transparent', color: 'inherit', outline: 'none',
              boxSizing: 'border-box', cursor: 'pointer',
            }}
          >
            {ADJUSTMENT_OPTIONS.map(opt => (
              <option key={opt.value} value={String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      }
      return (
        <input
          ref={inputRef}
          value={editVal}
          type={col.type === 'date' ? 'date' : col.type === 'number' ? 'number' : 'text'}
          onChange={e => setEditVal(e.target.value)}
          onBlur={deferBlur}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%', padding: '2px 4px', height: '26px', fontSize: '13px',
            border: `1px solid ${hx.active}`, borderRadius: '2px',
            background: 'transparent', color: 'inherit', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      );
    }

    const value = cellVal(entry, col.key);
    const isNum = col.type === 'number' || col.type === 'computed';
    const num = Number(value);

    let displayContent: React.ReactNode;
    if (col.key === 'type' && value) {
      const icon = categoryIcons[String(value)] || '📌';
      displayContent = <>{icon} {String(value)}</>;
    } else if (col.key === 'adjustment') {
      const opt = ADJUSTMENT_OPTIONS.find(o => o.value === num);
      displayContent = opt ? opt.label : `×${num}`;
    } else {
      displayContent = isNum ? fmtNum(num) : String(value);
    }

    return (
      <div
        onMouseDown={e => {
          if (col.editable) {
            e.preventDefault();
            startEdit(entry.id, col.key);
          }
        }}
        style={{
          padding: '2px 6px', height: '26px', lineHeight: '26px',
          fontSize: '13px', cursor: col.editable ? 'cell' : 'default',
          textAlign: isNum && col.key !== 'adjustment' ? 'right' : 'left',
          color: isNum && num < 0 ? hx.expense : undefined,
          fontFamily: isNum && col.key !== 'adjustment' ? 'monospace' : undefined,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
        title={String(value)}
      >
        {displayContent}
      </div>
    );
  };

  // ── Entries tab ───────────────────────────────────────────

  const renderEntries = () => (
    <VStack align="stretch" gap={0} h="100%">
      <HStack px={4} py={2} borderBottom="1px solid" borderColor={borderColor} flexShrink={0} flexWrap="wrap">
        <Button size="sm" colorScheme="blue" onClick={addEntry}>
          <Plus size={14} />&nbsp;Add Row
        </Button>
        <Button size="sm" variant="outline" onClick={manualSave}>
          <Save size={14} />&nbsp;Save
        </Button>
        <Button size="sm" variant="outline" onClick={exportCSV}>
          <Download size={14} />&nbsp;Export
        </Button>
        <Button size="sm" variant="outline" onClick={importCSV}>
          <Upload size={14} />&nbsp;Import CSV
        </Button>
        {hasFilters && (
          <Button size="sm" variant="ghost" onClick={() => { setFilters({}); setDateFrom(''); setDateTo(''); }}>
            <X size={14} />&nbsp;Clear Filters
          </Button>
        )}
        <Box flex={1} />
        <select
          value={displayYear}
          onChange={e => setDisplayYear(e.target.value)}
          style={{
            height: '28px', fontSize: '12px', padding: '2px 6px',
            border: `1px solid ${hx.border}`, borderRadius: '4px',
            background: 'transparent', color: 'inherit', cursor: 'pointer',
          }}
        >
          <option value="">Latest 50</option>
          {availableDisplayYears.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <Text fontSize="xs" color={mutedColor}>
          {displayedEntries.length} of {entries.length} rows
          {saveStatus === 'saving' && ' · Saving…'}
          {saveStatus === 'saved' && ' · Saved'}
        </Text>
      </HStack>

      {addingCat && (
        <HStack px={4} py={2} borderBottom="1px solid" borderColor={borderColor} bg={headerBg} gap={2} flexWrap="wrap">
          <Text fontSize="sm" fontWeight={500}>New category:</Text>
          <Input
            size="sm" placeholder="Category name" autoFocus
            value={newCatName} onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { setAddingCat(false); setAddCatForRow(null); } }}
            style={{ width: '180px', height: '28px', fontSize: '13px' }}
          />
          <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input type="checkbox" checked={newCatDeduct} onChange={e => setNewCatDeduct(e.target.checked)} />
            Tax deductible
          </label>
          <Input
            size="sm" placeholder="Notes (optional)"
            value={newCatNotes} onChange={e => setNewCatNotes(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); }}
            style={{ width: '200px', height: '28px', fontSize: '13px' }}
          />
          <Button size="xs" colorScheme="blue" onClick={handleAddCategory}>Add</Button>
          <Button size="xs" variant="ghost" onClick={() => { setAddingCat(false); setAddCatForRow(null); }}>Cancel</Button>
        </HStack>
      )}

      {csvImport ? (
        <>
          <HStack px={4} py={2} borderBottom="1px solid" borderColor={borderColor} bg={headerBg} flexWrap="wrap" gap={2} flexShrink={0}>
            <Text fontSize="sm" fontWeight={600}>CSV Import</Text>
            <select
              value={csvImport.selectedProfile}
              onChange={e => e.target.value ? applyCsvProfile(e.target.value) : updateCsvMapping('selectedProfile', '')}
              style={{ height: '28px', fontSize: '12px', padding: '2px 6px', border: `1px solid ${hx.border}`, borderRadius: '4px', background: 'transparent', color: 'inherit' }}
            >
              <option value="">New mapping</option>
              {csvProfiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
            <Button size="xs" variant="outline" onClick={saveCsvProfile}><Save size={12} />&nbsp;Save Profile</Button>
            {csvImport.selectedProfile && (
              <Button size="xs" variant="ghost" colorScheme="red" onClick={deleteCsvProfile}><Trash2 size={12} />&nbsp;Delete</Button>
            )}
            <Text fontSize="sm" fontWeight={500}>Bank:</Text>
            <Input size="sm" value={csvImport.bank} onChange={e => updateCsvMapping('bank', e.target.value)}
              placeholder="Bank name" style={{ width: '160px', height: '28px', fontSize: '13px' }} />
            <Text fontSize="sm" fontWeight={500}>Date format:</Text>
            <select
              value={csvImport.dateFormat}
              onChange={e => updateCsvMapping('dateFormat', e.target.value)}
              style={{ height: '28px', fontSize: '12px', padding: '2px 6px', border: `1px solid ${hx.border}`, borderRadius: '4px', background: 'transparent', color: 'inherit' }}
            >
              {DATE_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <Text fontSize="sm" fontWeight={500}>Skip rows:</Text>
            <Input size="sm" type="number" min={0}
              value={csvImport.skipRows}
              onChange={e => updateCsvMapping('skipRows', Math.max(0, parseInt(e.target.value) || 0))}
              style={{ width: '60px', height: '28px', fontSize: '13px', textAlign: 'center' }}
            />
            <Box flex={1} />
            <Text fontSize="xs" color={mutedColor}>
              {csvImport.preview.filter(r => r.selected).length} of {csvImport.preview.length} selected
            </Text>
            <Button size="sm" colorScheme="blue" onClick={confirmCsvImport}
              disabled={csvImport.preview.filter(r => r.selected).length === 0}>
              Import Selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCsvImport(null)}>Cancel</Button>
          </HStack>

          <HStack px={4} py={1} borderBottom="1px solid" borderColor={borderColor} bg={hx.filter} gap={1} flexWrap="wrap" flexShrink={0}>
            <Text fontSize="xs" fontWeight={600} mr={1}>Column mapping:</Text>
            {csvImport.headers.map(h => (
              <Flex key={h} direction="column" align="center" gap={0} style={{ minWidth: '100px' }}>
                <Text fontSize="10px" fontWeight={600} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }} title={h}>{h}</Text>
                <select
                  value={csvImport.columnMap[h] || ''}
                  onChange={e => {
                    const newMap = { ...csvImport.columnMap, [h]: e.target.value };
                    updateCsvMapping('columnMap', newMap);
                  }}
                  style={{ height: '24px', fontSize: '11px', padding: '1px 4px', border: `1px solid ${hx.border}`, borderRadius: '3px', background: 'transparent', color: 'inherit', width: '100px' }}
                >
                  {CSV_TARGET_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </Flex>
            ))}
          </HStack>

          <Box flex={1} overflow="auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ width: '36px', padding: '6px', background: hx.header, borderBottom: `2px solid ${hx.border}`, position: 'sticky', top: 0, zIndex: 2, textAlign: 'center' }}>
                    <input type="checkbox"
                      checked={csvImport.preview.length > 0 && csvImport.preview.every(r => r.selected)}
                      onChange={e => {
                        const checked = e.target.checked;
                        setCsvImport({ ...csvImport, preview: csvImport.preview.map(r => ({ ...r, selected: r.valid && checked })) });
                      }}
                      style={{ cursor: 'pointer' }}
                    /> 
                  </th>
                  <th style={{ padding: '6px 8px', background: hx.header, borderBottom: `2px solid ${hx.border}`, position: 'sticky', top: 0, zIndex: 2, textAlign: 'left', fontWeight: 600, fontSize: '12px' }}>Date</th>
                  <th style={{ padding: '6px 8px', background: hx.header, borderBottom: `2px solid ${hx.border}`, position: 'sticky', top: 0, zIndex: 2, textAlign: 'right', fontWeight: 600, fontSize: '12px', width: '120px' }}>Amount</th>
                  <th style={{ padding: '6px 8px', background: hx.header, borderBottom: `2px solid ${hx.border}`, position: 'sticky', top: 0, zIndex: 2, textAlign: 'left', fontWeight: 600, fontSize: '12px' }}>Comment</th>
                  <th style={{ padding: '6px 8px', background: hx.header, borderBottom: `2px solid ${hx.border}`, position: 'sticky', top: 0, zIndex: 2, textAlign: 'left', fontWeight: 600, fontSize: '12px' }}>From</th>
                  <th style={{ padding: '6px 8px', background: hx.header, borderBottom: `2px solid ${hx.border}`, position: 'sticky', top: 0, zIndex: 2, textAlign: 'left', fontWeight: 600, fontSize: '12px' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {csvImport.preview.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 ? hx.altRow : undefined, opacity: r.valid ? (r.selected ? 1 : 0.5) : 0.3 }}>
                    <td style={{ padding: '2px', textAlign: 'center', borderBottom: `1px solid ${hx.border}` }}>
                      <input type="checkbox" checked={r.selected} disabled={!r.valid}
                        onChange={() => setCsvImport({ ...csvImport, preview: csvImport.preview.map((x, j) => j === i ? { ...x, selected: !x.selected } : x) })}
                        style={{ cursor: r.valid ? 'pointer' : 'not-allowed' }}
                      />
                    </td>
                    <td style={{ padding: '2px 8px', borderBottom: `1px solid ${hx.border}`, fontSize: '13px' }}>{r.date || '—'}</td>
                    <td style={{ padding: '2px 8px', borderBottom: `1px solid ${hx.border}`, textAlign: 'right', fontFamily: 'monospace', fontSize: '13px', color: r.amount < 0 ? hx.expense : undefined }}>{r.valid ? fmtNum(r.amount) : '—'}</td>
                    <td style={{ padding: '2px 8px', borderBottom: `1px solid ${hx.border}`, fontSize: '13px' }}>{r.comment}</td>
                    <td style={{ padding: '2px 8px', borderBottom: `1px solid ${hx.border}`, fontSize: '13px' }}>{r.from}</td>
                    <td style={{ padding: '2px 8px', borderBottom: `1px solid ${hx.border}`, fontSize: '13px' }}>{r.details}</td>
                  </tr>
                ))}
                {csvImport.preview.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: hx.muted }}>
                      No rows in CSV file.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Box>
        </>
      ) : (
      <Box flex={1} overflow="auto">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              <th style={{ width: '36px', padding: '4px', background: hx.header, borderBottom: `2px solid ${hx.border}`, position: 'sticky', top: 0, zIndex: 2 }} />
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  style={{
                    width: col.width, minWidth: col.width, maxWidth: col.width, padding: '4px 6px',
                    background: hx.header, borderBottom: `2px solid ${hx.border}`,
                    cursor: 'pointer', userSelect: 'none', textAlign: 'left',
                    fontWeight: 600, fontSize: '12px', position: 'sticky', top: 0, zIndex: 2,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {col.label}
                    <SortIcon col={col.key} />
                  </span>
                </th>
              ))}
            </tr>
            <tr>
              <td style={{ padding: '2px', background: hx.filter, borderBottom: `1px solid ${hx.border}`, position: 'sticky', top: '30px', zIndex: 1 }} />
              {COLUMNS.map(col => (
                <td key={`f-${col.key}`} style={{ padding: '2px 4px', background: hx.filter, borderBottom: `1px solid ${hx.border}`, position: 'sticky', top: '30px', zIndex: 1 }}>
                  {col.key === 'date' ? (
                    <div style={{ display: 'flex', flexDirection: 'row', gap: '2px', maxWidth: '180px' }}>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        title="From date"
                        style={{
                          flex: 1, minWidth: 0, width: 0, height: '22px', fontSize: '9px', padding: '0 1px',
                          border: `1px solid ${hx.border}`, borderRadius: '2px',
                          background: 'transparent', color: 'inherit', outline: 'none',
                          boxSizing: 'border-box', overflow: 'hidden',
                        }}
                      />
                      <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        title="To date"
                        style={{
                          flex: 1, minWidth: 0, width: 0, height: '22px', fontSize: '9px', padding: '0 1px',
                          border: `1px solid ${hx.border}`, borderRadius: '2px',
                          background: 'transparent', color: 'inherit', outline: 'none',
                          boxSizing: 'border-box', overflow: 'hidden',
                        }}
                      />
                    </div>
                  ) : col.type === 'computed' ? null
                    : filterOptions[col.key] ? (
                      <select
                        value={filters[col.key] || ''}
                        onChange={e => setFilters(prev => ({ ...prev, [col.key]: e.target.value }))}
                        style={{
                          width: '100%', height: '22px', fontSize: '11px', padding: '0 2px',
                          border: `1px solid ${hx.border}`, borderRadius: '2px',
                          background: 'transparent', color: 'inherit', outline: 'none',
                          boxSizing: 'border-box', cursor: 'pointer',
                        }}
                      >
                        <option value="">All</option>
                        {filterOptions[col.key].map(v => (
                          <option key={v} value={v}>
                            {col.key === 'type' ? `${categoryIcons[v] || '📌'} ${v}` : v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        placeholder="Filter…"
                        value={filters[col.key] || ''}
                        onChange={e => setFilters(prev => ({ ...prev, [col.key]: e.target.value }))}
                        style={{
                          width: '100%', height: '22px', fontSize: '11px', padding: '1px 4px',
                          border: `1px solid ${hx.border}`, borderRadius: '2px',
                          background: 'transparent', color: 'inherit', outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    )
                  }
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedEntries.map((entry, idx) => (
              <tr key={entry.id} style={{ background: idx % 2 ? hx.altRow : undefined }}>
                <td style={{ padding: '2px', textAlign: 'center', borderBottom: `1px solid ${hx.border}` }}>
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    title="Delete row"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '2px', color: hx.muted, display: 'flex', alignItems: 'center',
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
                {COLUMNS.map(col => (
                  <td
                    key={`${entry.id}-${col.key}`}
                    style={{
                      padding: 0, borderBottom: `1px solid ${hx.border}`,
                      borderRight: `1px solid ${hx.border}`,
                      background: editing?.row === entry.id && editing?.col === col.key ? hx.active : undefined,
                    }}
                  >
                    {renderCell(entry, col)}
                  </td>
                ))}
              </tr>
            ))}
            {!hasFilters && (() => {
              const phantom = phantomRef.current;
              const pIdx = displayedEntries.length;
              return (
                <tr key={phantom.id} style={{ background: pIdx % 2 ? hx.altRow : undefined, opacity: 0.5 }}>
                  <td style={{ padding: '2px', textAlign: 'center', borderBottom: `1px solid ${hx.border}` }} />
                  {COLUMNS.map(col => (
                    <td
                      key={`${phantom.id}-${col.key}`}
                      style={{
                        padding: 0, borderBottom: `1px solid ${hx.border}`,
                        borderRight: `1px solid ${hx.border}`,
                        background: editing?.row === phantom.id && editing?.col === col.key ? hx.active : undefined,
                      }}
                    >
                      {renderCell(phantom, col)}
                    </td>
                  ))}
                </tr>
              );
            })()}
            {displayedEntries.length === 0 && !hasFilters && (
              <tr>
                <td colSpan={COLUMNS.length + 1} style={{ padding: '24px', textAlign: 'center', color: hx.muted }}>
                  No entries yet. Click any cell below or "Add Row" to begin.
                </td>
              </tr>
            )}
          </tbody>
          {displayedEntries.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 600, background: hx.header }}>
                <td style={{ borderTop: `2px solid ${hx.border}` }} />
                <td style={{ padding: '4px 6px', borderTop: `2px solid ${hx.border}`, fontSize: '12px' }}>Totals</td>
                <td style={{ padding: '4px 6px', borderTop: `2px solid ${hx.border}`, textAlign: 'right', fontFamily: 'monospace', fontSize: '13px' }}>
                  {fmtNum(displayedEntries.reduce((s, e) => s + e.amount, 0))}
                </td>
                <td style={{ borderTop: `2px solid ${hx.border}` }} />
                <td style={{ borderTop: `2px solid ${hx.border}` }} />
                <td style={{ borderTop: `2px solid ${hx.border}` }} />
                <td style={{ borderTop: `2px solid ${hx.border}` }} />
                <td style={{ borderTop: `2px solid ${hx.border}` }} />
                <td style={{ borderTop: `2px solid ${hx.border}` }} />
                <td style={{ padding: '4px 6px', borderTop: `2px solid ${hx.border}`, textAlign: 'right', fontFamily: 'monospace', fontSize: '13px' }}>
                  {fmtNum(displayedEntries.reduce((s, e) => s + adjusted(e), 0))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </Box>
      )}
    </VStack>
  );

  // ── Pivot table renderer ──────────────────────────────────

  const renderPivotTable = (expenseTypes: string[], expenseLabel: string) => {
    const { months, income, byType } = pivotData;
    const v = (map: Record<string, number> | undefined, m: string) => map?.[m] || 0;
    const rowSum = (map: Record<string, number> | undefined) =>
      months.reduce((s, m) => s + v(map, m), 0);
    const expTotal = (m: string) =>
      expenseTypes.reduce((s, t) => s + v(byType[t], m), 0);
    const expGrand = months.reduce((s, m) => s + expTotal(m), 0);
    const incomeTotal = rowSum(income);
    const fmt = (n: number) => n === 0 ? '-' : fmtNum(n);

    const thStyle: React.CSSProperties = {
      padding: '4px 8px', textAlign: 'right', fontWeight: 600, fontSize: '12px',
      borderBottom: `2px solid ${hx.border}`, borderRight: `1px solid ${hx.border}`,
      background: hx.header, position: 'sticky', top: 0, zIndex: 2, whiteSpace: 'nowrap',
    };
    const th0Style: React.CSSProperties = {
      ...thStyle, textAlign: 'left', position: 'sticky', left: 0, zIndex: 3, minWidth: '190px',
    };
    const numCell = (n: number, bold = false, extraCss?: React.CSSProperties): React.CSSProperties => ({
      padding: '2px 8px', textAlign: 'right', fontFamily: 'monospace', fontSize: '12px',
      fontWeight: bold ? 700 : 400, borderBottom: `1px solid ${hx.border}`,
      borderRight: `1px solid ${hx.border}`, whiteSpace: 'nowrap',
      color: n < 0 ? hx.expense : undefined, ...extraCss,
    });
    const labelCell = (indent = false, bold = false, bg?: string): React.CSSProperties => ({
      padding: indent ? '2px 8px 2px 24px' : '2px 8px',
      textAlign: 'left', fontSize: '12px', fontWeight: bold ? 700 : 500,
      borderBottom: `1px solid ${hx.border}`, borderRight: `1px solid ${hx.border}`,
      whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1,
      background: bg || 'inherit',
    });
    const sep: React.CSSProperties = { borderTop: `2px solid ${hx.border}` };

    return (
      <table style={{ borderCollapse: 'collapse', fontSize: '12px', minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={th0Style} />
            {months.map((m, i) => <th key={m} style={thStyle}>{MONTH_NAMES[i]}</th>)}
            <th style={{ ...thStyle, fontWeight: 700 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {/* Income */}
          <tr style={{ background: hx.incomeBg }}>
            <td style={labelCell(false, true, hx.incomeBg)}>Income</td>
            {months.map(m => { const n = v(income, m); return <td key={m} style={numCell(n)}>{fmt(n)}</td>; })}
            <td style={numCell(incomeTotal, true)}>{fmt(incomeTotal)}</td>
          </tr>
          {/* Expenses header */}
          <tr>
            <td style={labelCell(false, true)}>{expenseLabel}</td>
            {months.map(m => <td key={m} style={{ borderBottom: `1px solid ${hx.border}`, borderRight: `1px solid ${hx.border}` }} />)}
            <td style={{ borderBottom: `1px solid ${hx.border}` }} />
          </tr>
          {/* Expense rows */}
          {expenseTypes.map(type => {
            const data = byType[type];
            const total = rowSum(data);
            return (
              <tr key={type}>
                <td style={labelCell(true)}>{type}</td>
                {months.map(m => { const n = v(data, m); return <td key={m} style={numCell(n)}>{fmt(n)}</td>; })}
                <td style={numCell(total, true)}>{fmt(total)}</td>
              </tr>
            );
          })}
          {/* Expense total */}
          <tr style={{ background: hx.header }}>
            <td style={{ ...labelCell(false, false, hx.header), ...sep }} />
            {months.map(m => { const n = expTotal(m); return <td key={m} style={numCell(n, true, sep)}>{fmt(n)}</td>; })}
            <td style={numCell(expGrand, true, sep)}>{fmt(expGrand)}</td>
          </tr>
          {/* Net */}
          <tr style={{ background: hx.netBg }}>
            <td style={{ ...labelCell(false, true, hx.netBg), ...sep }}>Net</td>
            {months.map(m => { const n = v(income, m) - expTotal(m); return <td key={m} style={numCell(n, true, sep)}>{fmt(n)}</td>; })}
            <td style={numCell(incomeTotal - expGrand, true, sep)}>{fmt(incomeTotal - expGrand)}</td>
          </tr>
        </tbody>
      </table>
    );
  };

  // ── Year selector (shared) ──────────────────────────────

  const renderYearSelector = () => (
    <HStack px={4} py={2} borderBottom="1px solid" borderColor={borderColor} gap={2} flexShrink={0}>
      <Text fontSize="sm" fontWeight={500}>Year:</Text>
      <Button size="xs" variant="ghost" onClick={() => setSummaryYear(y => y - 1)}>&lt;</Button>
      <Text fontSize="sm" fontWeight={600} style={{ minWidth: '40px', textAlign: 'center' }}>{summaryYear}</Text>
      <Button size="xs" variant="ghost" onClick={() => setSummaryYear(y => y + 1)}>&gt;</Button>
      {availableYears.map(y => (
        <Button key={y} size="xs"
          variant={y === summaryYear ? 'solid' : 'ghost'}
          colorScheme={y === summaryYear ? 'blue' : undefined}
          onClick={() => setSummaryYear(y)}
        >{y}</Button>
      ))}
    </HStack>
  );

  // ── Summary tab ───────────────────────────────────────────

  const renderSummary = () => (
    <Box h="100%" display="flex" flexDirection="column">
      {renderYearSelector()}
      <Box flex={1} overflow="auto">
        {entries.length === 0
          ? <Text color={mutedColor} textAlign="center" py={8}>No entries yet. Add some in the Entries tab.</Text>
          : renderPivotTable(pivotData.expenseTypes, 'Expenses')
        }
      </Box>
    </Box>
  );

  // ── Tax summary tab ───────────────────────────────────────

  const renderTax = () => {
    const deductibleTypes = categories
      .filter(c => c.taxDeductible && c.name !== 'Income')
      .map(c => c.name);

    return (
      <Box h="100%" display="flex" flexDirection="column">
        {renderYearSelector()}
        <Box px={4} py={2} borderBottom="1px solid" borderColor={borderColor} flexShrink={0}>
          <Flex flexWrap="wrap" gap={1} align="center">
            <Text fontSize="xs" fontWeight={500} mr={2}>Tax deductible categories:</Text>
            {categories.filter(c => c.name !== 'Income').map(c => (
              <Button key={c.id} size="xs"
                variant={c.taxDeductible ? 'solid' : 'outline'}
                colorScheme={c.taxDeductible ? 'orange' : 'gray'}
                onClick={() => toggleCategoryTax(c.id)}
                style={{ height: '22px', fontSize: '10px', padding: '0 8px' }}
              >{c.name}</Button>
            ))}
          </Flex>
        </Box>
        <Box flex={1} overflow="auto">
          {entries.length === 0
            ? <Text color={mutedColor} textAlign="center" py={8}>No entries yet. Add some in the Entries tab.</Text>
            : renderPivotTable(deductibleTypes, 'Deductible Expenses')
          }
        </Box>
      </Box>
    );
  };

  // ── Lists tab ───────────────────────────────────────────

  const renderListTab = (listKey: string) => {
    const thStyle: React.CSSProperties = {
      padding: '6px 8px', fontWeight: 600, fontSize: '12px', textAlign: 'left',
      background: hx.header, borderBottom: `2px solid ${hx.border}`,
      borderRight: `1px solid ${hx.border}`, position: 'sticky' as const, top: 0, zIndex: 2,
    };
    const tdStyle: React.CSSProperties = {
      padding: 0, borderBottom: `1px solid ${hx.border}`, borderRight: `1px solid ${hx.border}`,
    };
    const cellInputStyle: React.CSSProperties = {
      width: '100%', padding: '2px 6px', height: '28px', fontSize: '13px',
      border: `1px solid ${hx.active}`, borderRadius: '2px',
      background: 'transparent', color: 'inherit', outline: 'none', boxSizing: 'border-box',
    };

    const renderCatCell = (cat: ExpenseCategory, field: 'name' | 'notes') => {
      const isEd = editingCat?.id === cat.id && editingCat?.field === field;
      if (isEd) {
        return (
          <input
            ref={inputRef}
            value={editCatVal}
            onChange={e => setEditCatVal(e.target.value)}
            onBlur={() => commitCatEdit(cat.id, field)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitCatEdit(cat.id, field);
              if (e.key === 'Escape') setEditingCat(null);
            }}
            style={cellInputStyle}
          />
        );
      }
      const val = cat[field];
      return (
        <div
          onClick={() => startCatEdit(cat.id, field, val)}
          style={{
            padding: '4px 8px', cursor: 'cell', minHeight: '28px', lineHeight: '20px',
            color: !val && field === 'notes' ? hx.muted : undefined,
          }}
        >
          {val || (field === 'notes' ? '(click to add)' : '')}
        </div>
      );
    };

    const renderTypesTable = () => (
      <>
        <HStack px={4} py={2} borderBottom="1px solid" borderColor={borderColor} flexShrink={0}>
          <Button size="sm" colorScheme="blue" onClick={() => { setAddingCat(true); setAddCatForRow(null); }}>
            <Plus size={14} />&nbsp;Add Category
          </Button>
          <Box flex={1} />
          <Text fontSize="xs" color={mutedColor}>{categories.length} categories</Text>
        </HStack>

        {addingCat && !addCatForRow && (
          <HStack px={4} py={2} borderBottom="1px solid" borderColor={borderColor} bg={headerBg} gap={2} flexWrap="wrap">
            <Text fontSize="sm" fontWeight={500}>New category:</Text>
            <Input
              size="sm" placeholder="Category name" autoFocus
              value={newCatName} onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { setAddingCat(false); } }}
              style={{ width: '180px', height: '28px', fontSize: '13px' }}
            />
            <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input type="checkbox" checked={newCatDeduct} onChange={e => setNewCatDeduct(e.target.checked)} />
              Tax deductible
            </label>
            <Input
              size="sm" placeholder="Notes (optional)"
              value={newCatNotes} onChange={e => setNewCatNotes(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); }}
              style={{ width: '200px', height: '28px', fontSize: '13px' }}
            />
            <Button size="xs" colorScheme="blue" onClick={handleAddCategory}>Add</Button>
            <Button size="xs" variant="ghost" onClick={() => setAddingCat(false)}>Cancel</Button>
          </HStack>
        )}

        <Box flex={1} overflow="auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: '50px', textAlign: 'center' }}>Icon</th>
                <th style={{ ...thStyle, minWidth: '180px' }}>Name</th>
                <th style={{ ...thStyle, width: '110px', textAlign: 'center' }}>Tax Deductible</th>
                <th style={{ ...thStyle, minWidth: '200px' }}>Notes</th>
                <th style={{ ...thStyle, width: '36px' }} />
              </tr>
            </thead>
            <tbody>
              {categories.map((cat, idx) => (
                <tr key={cat.id} style={{ background: idx % 2 ? hx.altRow : undefined }}>
                  <td style={{ ...tdStyle, textAlign: 'center', fontSize: '16px', padding: '4px' }}>
                    {editingCat?.id === cat.id && editingCat?.field === 'icon' ? (
                      <input
                        ref={inputRef}
                        value={editCatVal}
                        onChange={e => setEditCatVal(e.target.value)}
                        onBlur={() => commitCatEdit(cat.id, 'icon')}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitCatEdit(cat.id, 'icon');
                          if (e.key === 'Escape') setEditingCat(null);
                        }}
                        style={{ ...cellInputStyle, width: '40px', textAlign: 'center', fontSize: '16px' }}
                      />
                    ) : (
                      <div
                        onClick={() => { setEditingCat({ id: cat.id, field: 'icon' }); setEditCatVal(cat.icon || CATEGORY_ICONS[cat.id] || '📌'); }}
                        style={{ cursor: 'cell' }}
                        title="Click to change icon"
                      >
                        {cat.icon || CATEGORY_ICONS[cat.id] || '📌'}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>{renderCatCell(cat, 'name')}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={cat.taxDeductible}
                      onChange={async () => {
                        const updated = categories.map(c =>
                          c.id === cat.id ? { ...c, taxDeductible: !c.taxDeductible } : c
                        );
                        await saveCategories(updated);
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td style={tdStyle}>{renderCatCell(cat, 'notes')}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button
                      onClick={async () => {
                        const updated = categories.filter(c => c.id !== cat.id);
                        await saveCategories(updated);
                      }}
                      title="Delete category"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '4px', color: hx.muted, display: 'flex', alignItems: 'center',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </>
    );

    const renderValueListTable = (columnKey: string) => {
      const values = valueLists[columnKey] || [];
      const addValue = async () => {
        const val = newListVal.trim();
        if (!val) return;
        if (values.includes(val)) { setAddingListVal(false); setNewListVal(''); return; }
        await saveValueLists({ ...valueLists, [columnKey]: [...values, val] });
        setNewListVal('');
        setAddingListVal(false);
      };
      const deleteValue = async (idx: number) => {
        const updated = values.filter((_, i) => i !== idx);
        await saveValueLists({ ...valueLists, [columnKey]: updated });
      };

      return (
        <>
          <HStack px={4} py={2} borderBottom="1px solid" borderColor={borderColor} flexShrink={0}>
            <Button size="sm" colorScheme="blue" onClick={() => { setAddingListVal(true); setNewListVal(''); }}>
              <Plus size={14} />&nbsp;Add Value
            </Button>
            <Box flex={1} />
            <Text fontSize="xs" color={mutedColor}>{values.length} values</Text>
          </HStack>

          {addingListVal && (
            <HStack px={4} py={2} borderBottom="1px solid" borderColor={borderColor} bg={headerBg} gap={2}>
              <Text fontSize="sm" fontWeight={500}>New value:</Text>
              <Input
                size="sm" placeholder={`New ${columnKey} value`} autoFocus
                value={newListVal} onChange={e => setNewListVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addValue(); if (e.key === 'Escape') setAddingListVal(false); }}
                style={{ width: '250px', height: '28px', fontSize: '13px' }}
              />
              <Button size="xs" colorScheme="blue" onClick={addValue}>Add</Button>
              <Button size="xs" variant="ghost" onClick={() => setAddingListVal(false)}>Cancel</Button>
            </HStack>
          )}

          <Box flex={1} overflow="auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, minWidth: '300px' }}>Value</th>
                  <th style={{ ...thStyle, width: '36px' }} />
                </tr>
              </thead>
              <tbody>
                {values.map((val, idx) => {
                  const isEd = editingCat?.id === String(idx) && editingCat?.field === columnKey;
                  return (
                    <tr key={idx} style={{ background: idx % 2 ? hx.altRow : undefined }}>
                      <td style={tdStyle}>
                        {isEd ? (
                          <input
                            ref={inputRef}
                            value={editCatVal}
                            onChange={e => setEditCatVal(e.target.value)}
                            onBlur={() => commitListItemEdit(columnKey, idx)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitListItemEdit(columnKey, idx);
                              if (e.key === 'Escape') setEditingCat(null);
                            }}
                            style={cellInputStyle}
                          />
                        ) : (
                          <div
                            onClick={() => { setEditingCat({ id: String(idx), field: columnKey }); setEditCatVal(val); }}
                            style={{ padding: '4px 8px', cursor: 'cell', minHeight: '28px', lineHeight: '20px' }}
                          >
                            {val}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => deleteValue(idx)}
                          title="Delete value"
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: '4px', color: hx.muted, display: 'flex', alignItems: 'center',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {values.length === 0 && (
                  <tr>
                    <td colSpan={2} style={{ padding: '24px', textAlign: 'center', color: hx.muted }}>
                      No predefined values yet. Click "Add Value" to begin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Box>
        </>
      );
    };

    return (
      <VStack align="stretch" gap={0} h="100%">
        {listKey === 'types' ? renderTypesTable() : renderValueListTable(listKey)}
      </VStack>
    );
  };

  // ── Main render ───────────────────────────────────────────

  return (
    <Box h="100%" display="flex" flexDirection="column" bg={bgColor}>
      {/* Header */}
      <Flex px={4} py={3} borderBottom="1px solid" borderColor={borderColor} align="center" flexShrink={0}>
        <Heading size="lg" flex={1}>Budget Sheet</Heading>
      </Flex>

      {/* File bar */}
      <HStack px={4} py={2} borderBottom="1px solid" borderColor={borderColor} bg={headerBg} flexShrink={0} flexWrap="wrap">
        <FileText size={16} />
        <Text fontSize="sm" fontWeight={500}>File:</Text>
        <Input
          size="sm"
          value={fileName}
          onChange={e => setFileName(e.target.value)}
          style={{ width: '160px', height: '28px', fontSize: '13px' }}
        />
        <Button size="sm" variant="outline" onClick={() => { setShowFiles(!showFiles); loadFiles(); }}>
          {showFiles ? 'Hide' : 'Open…'}
        </Button>
        {showFiles && fileList.length > 0 && fileList.map(f => (
          <Button key={f} size="xs" variant={f === fileName ? 'solid' : 'ghost'}
            onClick={() => { setFileName(f); setShowFiles(false); }}>
            {f}
          </Button>
        ))}
      </HStack>

      {/* Tabs */}
      <HStack px={4} py={2} borderBottom="1px solid" borderColor={borderColor} gap={1} flexShrink={0} flexWrap="wrap">
        {([
            ['entries', 'Entries'], 
            ['summary', 'Summary'], 
            ['tax', 'Tax Summary'], 
            ['types', 'Types'], 
            ['from', 'From'], 
            ['bank', 'Bank'], 
            ['details', 'Details']
          ] as const).map(([tab, label]) => (
          <Button
            key={tab}
            size="sm"
            variant={activeTab === tab ? 'solid' : 'outline'}
            colorScheme={activeTab === tab ? 'blue' : undefined}
            onClick={() => { setActiveTab(tab); setEditingCat(null); setAddingListVal(false); setAddingCat(false); }}
          >
            {label}
          </Button>
        ))}
      </HStack>

      {/* Content */}
      <Box flex={1} overflow="hidden">
        {activeTab === 'entries' && renderEntries()}
        {activeTab === 'summary' && renderSummary()}
        {activeTab === 'tax' && renderTax()}
        {(activeTab === 'types' || activeTab === 'from' || activeTab === 'bank' || activeTab === 'details') && renderListTab(activeTab)}
      </Box>
    </Box>
  );
};

export default BudgetSheet;
