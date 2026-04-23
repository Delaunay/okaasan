import React, { useState, useRef, useCallback } from 'react';
import { BlockBase, BlockDef, BlockSetting, MarkdownGeneratorContext } from "../base";
import { Box, Text, Table, Input, Flex } from '@chakra-ui/react';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { useColorModeValue } from '../../ui/color-mode';

// ─── Data Types ─────────────────────────────────────────────────────────────

export interface CellName {
    name: string;
    ref: string; // e.g. "A1" or "A1:B3"
}

export type NumberFormat = "default" | "currency" | "percent" | "decimal2" | "integer";
export type TextAlign   = "left" | "center" | "right";

export interface ColFormat {
    numberFormat?: NumberFormat;
    align?: TextAlign;
    color?: string; // hex string e.g. "#e53e3e", or "" for none
}

export interface SpreadsheetData {
    title?: string;
    headers?: string[];
    showHeaders?: boolean;
    data: string[][];
    namedCells?: CellName[];
    colFormats?: ColFormat[];
    viewMode?: "table" | "bullets";
    rows?: number;
    cols?: number;
}

export interface SpreadsheetBlockDef extends BlockDef {
    kind: "spreadsheet";
    data: SpreadsheetData;
}

// ─── Formula Engine ──────────────────────────────────────────────────────────

const BUILTINS = {
    SUM: (...args: number[]) => args.flat(Infinity as any).reduce((a: number, b: number) => a + Number(b), 0),
    AVG: (...args: number[]) => { const flat = args.flat(Infinity as any) as number[]; return flat.reduce((a, b) => a + Number(b), 0) / flat.length; },
    MIN: (...args: number[]) => Math.min(...(args.flat(Infinity as any) as number[]).map(Number)),
    MAX: (...args: number[]) => Math.max(...(args.flat(Infinity as any) as number[]).map(Number)),
    COUNT: (...args: any[]) => (args.flat(Infinity as any) as any[]).filter(v => v !== "" && v != null).length,
};

function colIndexToLetter(col: number): string {
    return String.fromCharCode(65 + col);
}

function parseCellRef(ref: string): [number, number] | null {
    const m = ref.match(/^([A-Z]+)(\d+)$/);
    if (!m) return null;
    const col = m[1].split("").reduce((acc, c) => acc * 26 + c.charCodeAt(0) - 64, 0) - 1;
    const row = parseInt(m[2], 10) - 1;
    return [row, col];
}

function parseRangeRef(ref: string): [[number, number], [number, number]] | null {
    const parts = ref.split(":");
    if (parts.length !== 2) return null;
    const start = parseCellRef(parts[0]);
    const end = parseCellRef(parts[1]);
    if (!start || !end) return null;
    return [start, end];
}

function buildRawContext(data: string[][]): Record<string, number | string> {
    const ctx: Record<string, number | string> = {};
    data.forEach((row, r) => {
        row.forEach((cell, c) => {
            const key = colIndexToLetter(c) + (r + 1);
            const num = parseFloat(cell);
            ctx[key] = isNaN(num) || cell.trim() === "" ? cell : num;
        });
    });
    return ctx;
}

function getRangeValues(data: string[][], start: [number, number], end: [number, number]): (number | string)[] {
    const vals: (number | string)[] = [];
    for (let r = start[0]; r <= end[0]; r++) {
        for (let c = start[1]; c <= end[1]; c++) {
            const cell = data[r]?.[c] ?? "";
            const num = parseFloat(cell);
            vals.push(isNaN(num) || cell.trim() === "" ? cell : num);
        }
    }
    return vals;
}

const VALID_JS_IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const JS_RESERVED = new Set(['break','case','catch','class','const','continue',
    'debugger','default','delete','do','else','export','extends','false','finally',
    'for','function','if','import','in','instanceof','let','new','null','return',
    'static','super','switch','this','throw','true','try','typeof','undefined',
    'var','void','while','with','yield']);

function isValidContextKey(name: string): boolean {
    return VALID_JS_IDENTIFIER.test(name) && !JS_RESERVED.has(name);
}

function buildContext(data: SpreadsheetData): Record<string, any> {
    const ctx: Record<string, any> = { ...BUILTINS, ...buildRawContext(data.data) };

    // Expose each column header as a named array of that column's values.
    // This lets formulas like =SUM(Cost) or =AVG(Price) work naturally.
    // Only add headers that are valid JS identifiers to avoid breaking new Function().
    (data.headers ?? []).forEach((header, colIdx) => {
        if (!header || !isValidContextKey(header)) return;
        const vals = data.data.map(row => {
            const cell = row[colIdx] ?? "";
            const num = parseFloat(cell);
            return isNaN(num) || cell.trim() === "" ? 0 : num;
        });
        ctx[header] = vals;
    });

    // Named cells/ranges override header-derived names if there's a conflict.
    // Skip names that aren't valid JS identifiers.
    (data.namedCells ?? []).forEach(({ name, ref }) => {
        if (!isValidContextKey(name)) return;
        const range = parseRangeRef(ref);
        if (range) {
            ctx[name] = getRangeValues(data.data, range[0], range[1]);
        } else {
            const cell = parseCellRef(ref);
            if (cell) {
                const [r, c] = cell;
                const raw = data.data[r]?.[c] ?? "";
                const num = parseFloat(raw);
                ctx[name] = isNaN(num) || raw.trim() === "" ? raw : num;
            }
        }
    });

    return ctx;
}

function evaluateCell(formula: string, ctx: Record<string, any>): string {
    if (!formula.startsWith("=")) return formula;
    const expr = formula.slice(1);
    try {
        const keys = Object.keys(ctx);
        const vals = keys.map(k => ctx[k]);
        // eslint-disable-next-line no-new-func
        const fn = new Function(...keys, `"use strict"; return (${expr})`);
        const result = fn(...vals);
        if (result === null || result === undefined) return "";
        return String(result);
    } catch {
        return "#ERROR";
    }
}

function runEvalPass(data: SpreadsheetData, ctx: Record<string, any>): string[][] {
    const resolved: string[][] = data.data.map(row => [...row]);
    resolved.forEach((row, r) => {
        row.forEach((cell, c) => {
            if (data.data[r][c].startsWith("=")) {
                const val = evaluateCell(data.data[r][c], ctx);
                resolved[r][c] = val;
                const key = colIndexToLetter(c) + (r + 1);
                const num = parseFloat(val);
                ctx[key] = isNaN(num) || val.trim() === "" ? val : num;
            }
        });
    });
    return resolved;
}

function evaluateAllFormulas(data: SpreadsheetData): string[][] {
    // Pass 1: evaluate formulas with raw column arrays (formula cells = 0 in named arrays)
    const ctx1 = buildContext(data);
    const pass1 = runEvalPass(data, ctx1);

    // Pass 2: rebuild named column arrays from pass-1 resolved values, re-evaluate
    // This makes =SUM(Cost) correct even when Cost column contains formulas
    const ctx2 = buildContext(data);
    (data.headers ?? []).forEach((header, colIdx) => {
        if (!header || !isValidContextKey(header)) return;
        const vals = pass1.map(row => {
            const cell = row[colIdx] ?? "";
            const num = parseFloat(cell);
            return isNaN(num) || cell.trim() === "" ? 0 : num;
        });
        ctx2[header] = vals;
    });
    return runEvalPass(data, ctx2);
}

// ─── Formatting ──────────────────────────────────────────────────────────────

function formatValue(value: string, fmt: ColFormat | undefined): string {
    if (!fmt?.numberFormat || fmt.numberFormat === "default") return value;
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    switch (fmt.numberFormat) {
        case "currency": return "$" + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        case "percent":  return num.toFixed(2) + "%";
        case "decimal2": return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        case "integer":  return Math.round(num).toLocaleString();
        default: return value;
    }
}

// ─── Edit Mode ───────────────────────────────────────────────────────────────

interface SpreadsheetEditorProps {
    block: SpreadsheetBlock;
    data: SpreadsheetData;
}

const SpreadsheetEditor: React.FC<SpreadsheetEditorProps> = ({ block, data }) => {
    const rawData: string[][] = data.data ?? [[""]];
    const headers: string[] = data.headers ?? rawData[0]?.map((_, i) => colIndexToLetter(i)) ?? [];
    const showHeaders = data.showHeaders !== false;

    const [selected, setSelected] = useState<[number, number] | null>(null);
    const [selectedCol, setSelectedCol] = useState<number | null>(null);
    const [nameBoxValue, setNameBoxValue] = useState("");
    const [formulaBarValue, setFormulaBarValue] = useState("");
    const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
    const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const rows = rawData.length;
    const cols = headers.length || (rawData[0]?.length ?? 1);

    const resolved = evaluateAllFormulas(data);

    const cellKey = (r: number, c: number) => `${r},${c}`;

    // Notify re-renders the article immediately; _updateBlock is debounced so
    // rapid keystrokes only produce one server request after typing stops.
    const commit = useCallback(() => {
        block.notify();
        if (persistTimer.current) clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(() => {
            block.article._updateBlock(block, block.def);
        }, 600);
    }, [block]);

    const focusCell = useCallback((r: number, c: number) => {
        setSelected([r, c]);
        setSelectedCol(null);
        const ref = colIndexToLetter(c) + (r + 1);
        const namedCell = (data.namedCells ?? []).find(n => n.ref === ref);
        setNameBoxValue(namedCell ? namedCell.name : ref);
        setFormulaBarValue(rawData[r]?.[c] ?? "");
        setTimeout(() => inputRefs.current.get(cellKey(r, c))?.focus(), 0);
    }, [data, rawData]);

    const updateCell = useCallback((r: number, c: number, value: string) => {
        while (block.def.data.data.length <= r) block.def.data.data.push([]);
        while (block.def.data.data[r].length <= c) block.def.data.data[r].push("");
        block.def.data.data[r][c] = value;
        commit();
    }, [block, commit]);

    const updateColFormat = useCallback((c: number, patch: Partial<ColFormat>) => {
        if (!block.def.data.colFormats) block.def.data.colFormats = [];
        while (block.def.data.colFormats.length <= c) block.def.data.colFormats.push({});
        block.def.data.colFormats[c] = { ...block.def.data.colFormats[c], ...patch };
        commit();
    }, [block, commit]);

    const handleCellKeyDown = (e: React.KeyboardEvent, r: number, c: number) => {
        if (e.key === "Tab") {
            e.preventDefault();
            const nextC = e.shiftKey ? c - 1 : c + 1;
            if (nextC >= 0 && nextC < cols) focusCell(r, nextC);
            else if (!e.shiftKey && nextC === cols && r + 1 < rows) focusCell(r + 1, 0);
            else if (e.shiftKey && nextC < 0 && r > 0) focusCell(r - 1, cols - 1);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (r + 1 < rows) focusCell(r + 1, c);
        } else if (e.key === "ArrowUp" && r > 0) {
            e.preventDefault(); focusCell(r - 1, c);
        } else if (e.key === "ArrowDown" && r + 1 < rows) {
            e.preventDefault(); focusCell(r + 1, c);
        } else if (e.key === "ArrowLeft" && c > 0 && (e.currentTarget as HTMLInputElement).selectionStart === 0) {
            e.preventDefault(); focusCell(r, c - 1);
        } else if (e.key === "ArrowRight" && c + 1 < cols && (e.currentTarget as HTMLInputElement).selectionEnd === (e.currentTarget as HTMLInputElement).value.length) {
            e.preventDefault(); focusCell(r, c + 1);
        } else if (e.key === "Escape") {
            setSelected(null);
        }
    };

    const handleNameBoxSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter" || !selected) return;
        const [r, c] = selected;
        const ref = colIndexToLetter(c) + (r + 1);
        const trimmed = nameBoxValue.trim();
        if (!trimmed || trimmed === ref) return;
        const existing = (block.def.data.namedCells ?? []).findIndex(n => n.ref === ref);
        if (!block.def.data.namedCells) block.def.data.namedCells = [];
        if (existing >= 0) block.def.data.namedCells[existing].name = trimmed;
        else block.def.data.namedCells.push({ name: trimmed, ref });
        commit();
    };

    const addRow = () => { block.def.data.data.push(Array(cols).fill("")); commit(); };
    const deleteRow = (r: number) => {
        block.def.data.data.splice(r, 1);
        if (selected?.[0] === r) setSelected(null);
        commit();
    };
    const addCol = () => {
        block.def.data.headers = [...(block.def.data.headers ?? []), colIndexToLetter(cols)];
        block.def.data.data.forEach(row => row.push(""));
        commit();
    };
    const deleteCol = (c: number) => {
        if (block.def.data.headers) block.def.data.headers.splice(c, 1);
        block.def.data.data.forEach(row => row.splice(c, 1));
        if (selected?.[1] === c) setSelected(null);
        commit();
    };
    const updateHeader = (c: number, value: string) => {
        if (!block.def.data.headers) block.def.data.headers = [];
        block.def.data.headers[c] = value;
        commit();
    };

    // Theme-aware colors
    const selectedBg   = useColorModeValue("blue.50",  "blue.900");
    const mutedColor   = useColorModeValue("gray.400", "gray.500");
    const deleteBg     = useColorModeValue("red.100",  "red.900");
    const deleteColor  = useColorModeValue("red.700",  "red.300");
    const addBtnColor  = useColorModeValue("gray.400", "gray.500");
    const addBtnHover  = useColorModeValue("gray.600", "gray.300");
    const formulaColor = "var(--chakra-colors-blue-500)";

    // Shared cell input style — mirrors Table.Cell's default padding so layout is identical
    const cellInputStyle: React.CSSProperties = {
        display: "block",
        width: "100%",
        height: "100%",
        border: "none",
        outline: "none",
        background: "transparent",
        padding: "var(--chakra-space-2) var(--chakra-space-4)",
        fontFamily: "inherit",
        fontSize: "inherit",
        color: "inherit",
        minWidth: "80px",
    };

    const colFormats: ColFormat[] = data.colFormats ?? [];
    const activeFmt = selectedCol !== null ? (colFormats[selectedCol] ?? {}) : {};

    return (
        <Box>
            {/* Formula bar — shown when a cell is selected */}
            <Box overflow="hidden" style={{ height: selected && !selectedCol ? "40px" : "0", transition: "height 0.12s ease" }}>
                <Flex gap={2} align="center" h="40px" pb={1}>
                    <Input
                        size="sm"
                        w="80px"
                        flexShrink={0}
                        value={nameBoxValue}
                        onChange={e => setNameBoxValue(e.target.value)}
                        onKeyDown={handleNameBoxSubmit}
                        placeholder="A1"
                        fontFamily="mono"
                        title="Cell name — press Enter to assign"
                    />
                    <Input
                        size="sm"
                        flex={1}
                        value={formulaBarValue}
                        onChange={e => {
                            setFormulaBarValue(e.target.value);
                            if (selected) updateCell(selected[0], selected[1], e.target.value);
                        }}
                        placeholder="Value or =formula"
                        fontFamily="mono"
                    />
                </Flex>
            </Box>

            {/* Column format bar — shown when a column header is focused */}
            <Box overflow="hidden" style={{ height: selectedCol !== null ? "40px" : "0", transition: "height 0.12s ease" }}>
                <Flex gap={3} align="center" h="40px" pb={1} px={1}>
                    <Text fontSize="xs" fontWeight="semibold" color={mutedColor} flexShrink={0}>
                        Col {selectedCol !== null ? headers[selectedCol] : ""}
                    </Text>

                    {/* Number format */}
                    <select
                        value={activeFmt.numberFormat ?? "default"}
                        onChange={e => selectedCol !== null && updateColFormat(selectedCol, { numberFormat: e.target.value as NumberFormat })}
                        style={{
                            fontSize: "12px", height: "28px", padding: "0 6px",
                            borderRadius: "var(--chakra-radii-sm)",
                            border: "1px solid var(--chakra-colors-border)",
                            background: "var(--chakra-colors-bg)",
                            color: "inherit", cursor: "pointer",
                        }}
                    >
                        <option value="default">Default</option>
                        <option value="integer">Integer</option>
                        <option value="decimal2">0.00</option>
                        <option value="currency">$ Currency</option>
                        <option value="percent">% Percent</option>
                    </select>

                    {/* Alignment */}
                    <Flex gap={1}>
                        {(["left", "center", "right"] as TextAlign[]).map((align) => {
                            const Icon = align === "left" ? AlignLeft : align === "center" ? AlignCenter : AlignRight;
                            const active = (activeFmt.align ?? "left") === align;
                            return (
                                <Box
                                    key={align}
                                    as="button"
                                    w="26px" h="26px"
                                    display="flex" alignItems="center" justifyContent="center"
                                    borderRadius="sm"
                                    border="1px solid"
                                    borderColor={active ? "blue.400" : "transparent"}
                                    bg={active ? selectedBg : "transparent"}
                                    color={active ? "blue.500" : mutedColor}
                                    cursor="pointer"
                                    title={`Align ${align}`}
                                    onClick={() => selectedCol !== null && updateColFormat(selectedCol, { align })}
                                >
                                    <Icon size={13} />
                                </Box>
                            );
                        })}
                    </Flex>

                    {/* Color swatch — click to open native color picker */}
                    <Box as="label" cursor="pointer" title="Column color" display="flex" alignItems="center" gap={1}>
                        <Box
                            w="22px" h="22px"
                            borderRadius="sm"
                            border="1px solid"
                            borderColor="gray.300"
                            style={{ background: activeFmt.color || "transparent" }}
                        />
                        <input
                            type="color"
                            value={activeFmt.color || "#000000"}
                            onChange={e => selectedCol !== null && updateColFormat(selectedCol, { color: e.target.value })}
                            style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
                        />
                    </Box>
                    {activeFmt.color && (
                        <Box
                            as="button"
                            fontSize="10px"
                            color={mutedColor}
                            cursor="pointer"
                            title="Clear color"
                            onClick={() => selectedCol !== null && updateColFormat(selectedCol, { color: "" })}
                        >
                            ✕
                        </Box>
                    )}
                </Flex>
            </Box>

            {/* Table — same structure as SpreadsheetView so dimensions match exactly */}
            <Box position="relative">
                <Table.Root>
                    {showHeaders && (
                        <Table.Header>
                            <Table.Row role="group">
                                {headers.map((h, c) => (
                                    <Table.ColumnHeader key={c} p={0} position="relative">
                                        <input
                                            value={h}
                                            onChange={e => updateHeader(c, e.target.value)}
                                            onFocus={() => { setSelectedCol(c); setSelected(null); }}
                                            style={{ ...cellInputStyle, fontWeight: "bold", textAlign: colFormats[c]?.align ?? "center" }}
                                        />
                                        {/* Delete column — appears on header hover */}
                                        <Box
                                            as="button"
                                            position="absolute"
                                            top="2px"
                                            right="2px"
                                            display="none"
                                            _groupHover={{ display: "flex" }}
                                            alignItems="center"
                                            justifyContent="center"
                                            w="14px"
                                            h="14px"
                                            fontSize="9px"
                                            bg={deleteBg}
                                            color={deleteColor}
                                            borderRadius="sm"
                                            cursor="pointer"
                                            onClick={() => deleteCol(c)}
                                            title="Delete column"
                                        >
                                            ×
                                        </Box>
                                    </Table.ColumnHeader>
                                ))}
                                {/* Add column */}
                                <Table.ColumnHeader p={0} w="28px" textAlign="center">
                                    <Box
                                        as="button"
                                        w="100%"
                                        h="100%"
                                        minH="8"
                                        display="flex"
                                        alignItems="center"
                                        justifyContent="center"
                                        color={addBtnColor}
                                        fontSize="16px"
                                        cursor="pointer"
                                        _hover={{ color: addBtnHover }}
                                        onClick={addCol}
                                        title="Add column"
                                    >
                                        +
                                    </Box>
                                </Table.ColumnHeader>
                            </Table.Row>
                        </Table.Header>
                    )}
                    <Table.Body>
                        {rawData.map((row, r) => (
                            <Table.Row key={r} role="group">
                                {Array.from({ length: cols }, (_, c) => {
                                    const isSelected = selected?.[0] === r && selected?.[1] === c;
                                    const rawVal = row[c] ?? "";
                                    const fmt = colFormats[c];
                                    const resolvedVal = resolved[r]?.[c] ?? "";
                                    const displayVal = isSelected ? rawVal : formatValue(resolvedVal, fmt);
                                    const isFormula = rawVal.startsWith("=") && !isSelected;
                                    const colColor = !isFormula && fmt?.color ? fmt.color : undefined;

                                    return (
                                        <Table.Cell
                                            key={c}
                                            p={0}
                                            position="relative"
                                            bg={isSelected ? selectedBg : undefined}
                                            outline={isSelected ? "2px solid" : "none"}
                                            outlineColor="blue.400"
                                            outlineOffset="-2px"
                                        >
                                            <input
                                                ref={el => {
                                                    if (el) inputRefs.current.set(cellKey(r, c), el);
                                                    else inputRefs.current.delete(cellKey(r, c));
                                                }}
                                                value={displayVal}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setFormulaBarValue(val);
                                                    updateCell(r, c, val);
                                                }}
                                                onFocus={() => focusCell(r, c)}
                                                onKeyDown={e => handleCellKeyDown(e, r, c)}
                                                style={{
                                                    ...cellInputStyle,
                                                    textAlign: fmt?.align ?? "left",
                                                    color: isFormula ? formulaColor : (colColor ?? "inherit"),
                                                }}
                                            />
                                            {/* Delete row — appears in the first cell of each row on hover */}
                                            {c === 0 && (
                                                <Box
                                                    as="button"
                                                    position="absolute"
                                                    left="-18px"
                                                    top="50%"
                                                    transform="translateY(-50%)"
                                                    display="none"
                                                    _groupHover={{ display: "flex" }}
                                                    alignItems="center"
                                                    justifyContent="center"
                                                    w="14px"
                                                    h="14px"
                                                    fontSize="9px"
                                                    bg={deleteBg}
                                                    color={deleteColor}
                                                    borderRadius="sm"
                                                    cursor="pointer"
                                                    onClick={() => deleteRow(r)}
                                                    title="Delete row"
                                                >
                                                    ×
                                                </Box>
                                            )}
                                        </Table.Cell>
                                    );
                                })}
                                {/* Empty cell to align with the add-column header */}
                                <Table.Cell p={0} w="28px" />
                            </Table.Row>
                        ))}
                    </Table.Body>
                </Table.Root>

                {/* Add row — below the table, left-aligned, unobtrusive */}
                <Box
                    as="button"
                    display="flex"
                    alignItems="center"
                    gap={1}
                    mt={1}
                    px={2}
                    py="2px"
                    fontSize="xs"
                    color={addBtnColor}
                    cursor="pointer"
                    borderRadius="sm"
                    _hover={{ color: addBtnHover }}
                    onClick={addRow}
                    title="Add row"
                >
                    <span style={{ fontSize: "14px", lineHeight: 1 }}>+</span> row
                </Box>
            </Box>
        </Box>
    );
};

// ─── View Mode ───────────────────────────────────────────────────────────────

interface SpreadsheetViewProps {
    data: SpreadsheetData;
}

const SpreadsheetView: React.FC<SpreadsheetViewProps> = ({ data }) => {
    const resolved = evaluateAllFormulas(data);
    const headers = data.headers ?? [];
    const showHeaders = data.showHeaders !== false;
    const viewMode = data.viewMode ?? "table";
    const colFormats: ColFormat[] = data.colFormats ?? [];
    const formulaCellColor = useColorModeValue("blue.600", "blue.300");

    if (viewMode === "bullets") {
        // Estimate max char width per column using the actual displayed strings (post-format)
        const colWidths = headers.map((h, c) => {
            const fmt = colFormats[c];
            const headerLen = h.length;
            const dataLen = resolved.reduce((max, row) => Math.max(max, formatValue(row[c] ?? "", fmt).length), 0);
            return Math.max(headerLen, dataLen, 4);
        });
        const totalWidth = colWidths.reduce((a, b) => a + b, 0) || 1;
        const colFrs = colWidths.map(w => `${Math.round((w / totalWidth) * 100)}fr`).join(" ");
        const gridCols = `1em ${colFrs}`;

        return (
            <Box>
                {data.title && <Text fontWeight="bold" mb={2}>{data.title}</Text>}
                <Box>
                    {/* Header row — no bullet, shifted right by the bullet column */}
                    {showHeaders && headers.length > 0 && (
                        <Box display="grid" gridTemplateColumns={gridCols} columnGap={4} mb={1}>
                            <Box />
                            {headers.map((h, c) => (
                                <Box key={c} fontWeight="semibold" fontSize="sm" color={formulaCellColor} textAlign={colFormats[c]?.align}>
                                    {h}
                                </Box>
                            ))}
                        </Box>
                    )}
                    {/* Data rows — bullet + columns aligned under headers */}
                    {resolved.map((row, r) => (
                        <Box key={r} display="grid" gridTemplateColumns={gridCols} columnGap={4} mb="2px">
                            <Box userSelect="none" color="inherit">•</Box>
                            {Array.from({ length: headers.length || row.length }, (_, c) => {
                                const fmt = colFormats[c];
                                const val = formatValue(row[c] ?? "", fmt);
                                const color = fmt?.color || (data.data[r]?.[c]?.startsWith("=") ? formulaCellColor : undefined);
                                return (
                                    <Box key={c} textAlign={fmt?.align} color={color}>
                                        {val}
                                    </Box>
                                );
                            })}
                        </Box>
                    ))}
                </Box>
            </Box>
        );
    }

    // Default: table view
    return (
        <Box>
            {data.title && <Text fontWeight="bold" mb={2}>{data.title}</Text>}
            <Table.Root>
                {showHeaders && headers.length > 0 && (
                    <Table.Header>
                        <Table.Row>
                            {headers.map((h, i) => (
                                <Table.ColumnHeader key={i} textAlign={colFormats[i]?.align}>{h}</Table.ColumnHeader>
                            ))}
                        </Table.Row>
                    </Table.Header>
                )}
                <Table.Body>
                    {resolved.map((row, r) => (
                        <Table.Row key={r}>
                            {row.map((cell, c) => {
                                const fmt = colFormats[c];
                                const val = formatValue(cell, fmt);
                                const color = fmt?.color || (data.data[r]?.[c]?.startsWith("=") ? formulaCellColor : undefined);
                                return (
                                    <Table.Cell key={c} textAlign={fmt?.align} color={color}>
                                        {val}
                                    </Table.Cell>
                                );
                            })}
                        </Table.Row>
                    ))}
                </Table.Body>
            </Table.Root>
        </Box>
    );
};

// ─── Block Class ─────────────────────────────────────────────────────────────

function initData(def: BlockDef): SpreadsheetData {
    if (!def.data) def.data = {};
    const d = def.data as SpreadsheetData;
    if (!d.data || d.data.length === 0) {
        d.data = [["", "", ""], ["", "", ""], ["", "", ""]];
    }
    if (!d.headers) {
        d.headers = Array.from({ length: d.data[0]?.length ?? 3 }, (_, i) => colIndexToLetter(i));
    }
    if (d.showHeaders === undefined) d.showHeaders = true;
    if (!d.viewMode) d.viewMode = "table";
    return d;
}

export class SpreadsheetBlock extends BlockBase {
    static kind = "spreadsheet";

    static {
        this.register();
    }

    component(mode: string): React.ReactNode {
        const data = initData(this.def);
        if (mode === "edit") {
            return <SpreadsheetEditor block={this} data={data} />;
        }
        return <SpreadsheetView data={data} />;
    }

    has_settings(): boolean {
        return true;
    }

    settings(): BlockSetting {
        return {
            title:       { type: "string", required: false },
            showHeaders: { type: "select", required: false, options: ["true", "false"] },
            viewMode:    { type: "select", required: false, options: ["table", "bullets"] },
        } as any;
    }

    // The spreadsheet has a custom edit mode — don't swap it for the markdown textarea
    is_md_representable(): boolean {
        return false;
    }

    is_md_block(): boolean {
        return true;
    }

    as_markdown(_ctx: MarkdownGeneratorContext): string {
        const data = this.def.data as SpreadsheetData;
        const headers = data.headers ?? [];
        const resolved = evaluateAllFormulas(data);
        const showHeaders = data.showHeaders !== false;

        const widths = computeColumnWidths(headers, resolved);
        const pad = (value: string, width: number) => value + " ".repeat(Math.max(0, width - value.length));

        let md = "";
        if (showHeaders && headers.length > 0) {
            md += "| " + headers.map((h, i) => pad(h, widths[i])).join(" | ") + " |\n";
            md += "| " + widths.map(w => "-".repeat(w)).join(" | ") + " |\n";
        }
        resolved.forEach(row => {
            md += "| " + widths.map((w, i) => pad(row[i] ?? "", w)).join(" | ") + " |\n";
        });
        return md;
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeColumnWidths(headers: string[], rows: string[][]): number[] {
    const widths = headers.map(h => h.length);
    rows.forEach(row => {
        row.forEach((cell, i) => {
            const val = cell != null ? String(cell) : "";
            widths[i] = Math.max(widths[i] ?? 0, val.length);
        });
    });
    return widths;
}
