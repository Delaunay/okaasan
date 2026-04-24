import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Grid,
  Heading,
  Input,
  HStack,
  Text,
  VStack,
  IconButton,
  Flex,
} from '@chakra-ui/react';
import { Trash, Plus, Save, FolderOpen, Copy } from 'lucide-react';
import { useColorModeValue } from '../ui/color-mode';
import { useParams, useNavigate } from 'react-router-dom';
import { jsonStore, isStaticMode } from '../../services/jsonstore';

// ──────────────────────────────────────────────
// Units & parsing
// ──────────────────────────────────────────────

const MM_PER_INCH = 25.4;
const MM_PER_FOOT = 304.8;

function parseLength(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const feetInches = s.match(/^(\d+(?:\.\d+)?)\s*(?:ft|'|feet)\s*(\d+(?:\.\d+)?)\s*(?:in|"|inches?)?\s*$/);
  if (feetInches) return parseFloat(feetInches[1]) * MM_PER_FOOT + parseFloat(feetInches[2]) * MM_PER_INCH;
  const feet = s.match(/^(\d+(?:\.\d+)?)\s*(?:ft|'|feet)\s*$/);
  if (feet) return parseFloat(feet[1]) * MM_PER_FOOT;
  const inches = s.match(/^(\d+(?:\.\d+)?)\s*(?:in|"|inches?)\s*$/);
  if (inches) return parseFloat(inches[1]) * MM_PER_INCH;
  const meters = s.match(/^(\d+(?:\.\d+)?)\s*m\s*$/);
  if (meters) return parseFloat(meters[1]) * 1000;
  const cm = s.match(/^(\d+(?:\.\d+)?)\s*cm\s*$/);
  if (cm) return parseFloat(cm[1]) * 10;
  const mm = s.match(/^(\d+(?:\.\d+)?)\s*(?:mm)?\s*$/);
  if (mm) return parseFloat(mm[1]);
  return null;
}

function formatLength(mm: number): string {
  const inches = mm / MM_PER_INCH;
  const ft = Math.floor(inches / 12);
  const remIn = inches % 12;
  if (ft > 0 && Math.abs(remIn) < 0.05) return `${ft}ft`;
  if (ft > 0) return `${ft}ft ${remIn.toFixed(1)}in`;
  if (mm >= 1000) return `${(mm / 1000).toFixed(2)}m`;
  return `${Math.round(mm)}mm`;
}

function formatMm(mm: number): string {
  return `${Math.round(mm)}mm`;
}

const IMPERIAL_FRACTIONS: Record<number, { thresholds: [number, string][] }> = {
  2:  { thresholds: [[0.25, '¹⁄₂']] },
  4:  { thresholds: [[0.125, '¹⁄₄'], [0.375, '¹⁄₂'], [0.625, '³⁄₄']] },
  8:  { thresholds: [[0.0625, '¹⁄₈'], [0.1875, '¹⁄₄'], [0.3125, '³⁄₈'], [0.4375, '¹⁄₂'], [0.5625, '⁵⁄₈'], [0.6875, '³⁄₄'], [0.8125, '⁷⁄₈']] },
  16: { thresholds: [[0.03125, '¹⁄₁₆'], [0.09375, '¹⁄₈'], [0.15625, '³⁄₁₆'], [0.21875, '¹⁄₄'], [0.28125, '⁵⁄₁₆'], [0.34375, '³⁄₈'], [0.40625, '⁷⁄₁₆'], [0.46875, '¹⁄₂'], [0.53125, '⁹⁄₁₆'], [0.59375, '⁵⁄₈'], [0.65625, '¹¹⁄₁₆'], [0.71875, '³⁄₄'], [0.78125, '¹³⁄₁₆'], [0.84375, '⁷⁄₈'], [0.90625, '¹⁵⁄₁₆']] },
};

function formatImperial(mm: number, resolution: number = 8): string {
  const totalInches = mm / MM_PER_INCH;
  const rounded = Math.round(totalInches * resolution) / resolution;
  const ft = Math.floor(rounded / 12);
  const remIn = rounded % 12;
  const whole = Math.floor(remIn);
  const frac = remIn - whole;

  const table = IMPERIAL_FRACTIONS[resolution] ?? IMPERIAL_FRACTIONS[8];
  let fracStr = '';
  for (const [thresh, sym] of table.thresholds) {
    if (frac >= thresh) fracStr = sym;
  }

  if (ft > 0 && whole === 0 && !fracStr) return `${ft}'`;
  if (ft > 0 && !fracStr) return `${ft}' ${whole}"`;
  if (ft > 0) return `${ft}' ${whole}${fracStr}"`;
  if (!fracStr) return `${whole}"`;
  return `${whole}${fracStr}"`;
}

function formatInchesOnly(mm: number, resolution: number = 8): string {
  const totalInches = mm / MM_PER_INCH;
  const rounded = Math.round(totalInches * resolution) / resolution;
  const whole = Math.floor(rounded);
  const frac = rounded - whole;

  const table = IMPERIAL_FRACTIONS[resolution] ?? IMPERIAL_FRACTIONS[8];
  let fracStr = '';
  for (const [thresh, sym] of table.thresholds) {
    if (frac >= thresh) fracStr = sym;
  }

  if (!fracStr) return `${whole}"`;
  return `${whole}${fracStr}"`;
}

// ──────────────────────────────────────────────
// Fraction simplification
// ──────────────────────────────────────────────

const SIMPLE_FRACTIONS = [
  { n: 1, d: 6 }, { n: 1, d: 5 }, { n: 1, d: 4 }, { n: 1, d: 3 },
  { n: 2, d: 5 }, { n: 1, d: 2 }, { n: 3, d: 5 }, { n: 2, d: 3 },
  { n: 3, d: 4 }, { n: 4, d: 5 }, { n: 5, d: 6 },
];

interface FractionMatch {
  n: number;
  d: number;
  stockLength: number;
  simplifiedLength: number;
}

function findBestFraction(
  cutLength: number, stockLengths: number[], toleranceMm: number, kerf: number = 0,
): FractionMatch | null {
  let best: (FractionMatch & { diff: number }) | null = null;
  for (const stockLen of stockLengths) {
    for (const f of SIMPLE_FRACTIONS) {
      // Dividing a board into d sections requires (d-1) saw cuts.
      // Each cut consumes kerf, so the usable piece for fraction n/d is:
      const fracLen = (stockLen - (f.d - 1) * kerf) * f.n / f.d;
      if (fracLen <= 0) continue;
      const diff = Math.abs(fracLen - cutLength);
      if (diff > toleranceMm) continue;
      if (fracLen < cutLength - 1) continue;
      if (!best || diff < best.diff) {
        best = { n: f.n, d: f.d, stockLength: stockLen, simplifiedLength: fracLen, diff };
      }
    }
  }
  return best;
}

function formatFraction(frac: FractionMatch): string {
  return `${frac.n}/${frac.d} of ${formatLength(frac.stockLength)}`;
}

interface CutFraction {
  label: string;
  originalLength: number;
  fraction: FractionMatch | null;
}

interface BoardRecipe {
  cuts: CutFraction[];
  allSimplified: boolean;
}

function computeBoardRecipe(used: UsedStock, tolerance: number, kerf: number = 0): BoardRecipe {
  const cuts = used.cuts.map(c => {
    const frac = findBestFraction(c.length, [used.stock.length], tolerance, kerf);
    return { label: c.label, originalLength: c.length, fraction: frac };
  });
  return { cuts, allSimplified: cuts.length > 0 && cuts.every(c => c.fraction !== null) };
}

interface RectFraction {
  label: string;
  originalW: number;
  originalH: number;
  fracW: FractionMatch | null;
  fracH: FractionMatch | null;
}

interface SheetRecipe {
  rects: RectFraction[];
  allSimplified: boolean;
}

function computeSheetRecipe(used: UsedSheet, tolerance: number, kerf: number = 0): SheetRecipe {
  const rects = used.rects.map(r => {
    const fracW = findBestFraction(r.w, [used.stock.length], tolerance, kerf);
    const fracH = findBestFraction(r.h, [used.stock.width], tolerance, kerf);
    return { label: r.label, originalW: r.w, originalH: r.h, fracW, fracH };
  });
  return { rects, allSimplified: rects.length > 0 && rects.every(r => r.fracW !== null && r.fracH !== null) };
}

// ──────────────────────────────────────────────
// Nominal sizes (lumber + plywood)
// ──────────────────────────────────────────────

type StockKind = 'lumber' | 'sheet';

interface NominalDef {
  nominal: string;
  kind: StockKind;
  actualMm: [number, number];
  actualIn: [number, number];
}

const NOMINAL_DEFS: NominalDef[] = [
  // Lumber
  { nominal: '1x2',  kind: 'lumber', actualIn: [0.75, 1.5],   actualMm: [19, 38] },
  { nominal: '1x3',  kind: 'lumber', actualIn: [0.75, 2.5],   actualMm: [19, 64] },
  { nominal: '1x4',  kind: 'lumber', actualIn: [0.75, 3.5],   actualMm: [19, 89] },
  { nominal: '1x6',  kind: 'lumber', actualIn: [0.75, 5.5],   actualMm: [19, 140] },
  { nominal: '1x8',  kind: 'lumber', actualIn: [0.75, 7.25],  actualMm: [19, 184] },
  { nominal: '1x10', kind: 'lumber', actualIn: [0.75, 9.25],  actualMm: [19, 235] },
  { nominal: '1x12', kind: 'lumber', actualIn: [0.75, 11.25], actualMm: [19, 286] },
  { nominal: '2x2',  kind: 'lumber', actualIn: [1.5, 1.5],    actualMm: [38, 38] },
  { nominal: '2x3',  kind: 'lumber', actualIn: [1.5, 2.5],    actualMm: [38, 64] },
  { nominal: '2x4',  kind: 'lumber', actualIn: [1.5, 3.5],    actualMm: [38, 89] },
  { nominal: '2x6',  kind: 'lumber', actualIn: [1.5, 5.5],    actualMm: [38, 140] },
  { nominal: '2x8',  kind: 'lumber', actualIn: [1.5, 7.25],   actualMm: [38, 184] },
  { nominal: '2x10', kind: 'lumber', actualIn: [1.5, 9.25],   actualMm: [38, 235] },
  { nominal: '2x12', kind: 'lumber', actualIn: [1.5, 11.25],  actualMm: [38, 286] },
  { nominal: '4x4',  kind: 'lumber', actualIn: [3.5, 3.5],    actualMm: [89, 89] },
  { nominal: '4x6',  kind: 'lumber', actualIn: [3.5, 5.5],    actualMm: [89, 140] },
  { nominal: '6x6',  kind: 'lumber', actualIn: [5.5, 5.5],    actualMm: [140, 140] },
  // Plywood sheets (thickness × standard 4'×8' sheet)
  { nominal: 'ply 1/4',  kind: 'sheet', actualIn: [0.25, 0.25],   actualMm: [6, 6] },
  { nominal: 'ply 3/8',  kind: 'sheet', actualIn: [0.375, 0.375], actualMm: [10, 10] },
  { nominal: 'ply 1/2',  kind: 'sheet', actualIn: [0.5, 0.5],     actualMm: [13, 13] },
  { nominal: 'ply 5/8',  kind: 'sheet', actualIn: [0.625, 0.625], actualMm: [16, 16] },
  { nominal: 'ply 3/4',  kind: 'sheet', actualIn: [0.75, 0.75],   actualMm: [19, 19] },
  { nominal: 'ply 1',    kind: 'sheet', actualIn: [1, 1],         actualMm: [25, 25] },
];

function lookupNominal(nominal: string): NominalDef | undefined {
  const n = nominal.trim().toLowerCase().replace(/\s+/g, ' ').replace('×', 'x');
  return NOMINAL_DEFS.find(d => d.nominal === n);
}

function nominalTooltip(info: NominalDef): string {
  if (info.kind === 'lumber') {
    return `Actual: ${info.actualIn[0]}" × ${info.actualIn[1]}" (${info.actualMm[0]} × ${info.actualMm[1]} mm)`;
  }
  return `Thickness: ${info.actualIn[0]}" (${info.actualMm[0]}mm)`;
}

// ──────────────────────────────────────────────
// Data types
// ──────────────────────────────────────────────

const STOCK_KINDS: StockKind[] = ['lumber', 'sheet'];

interface StockPiece {
  id: number;
  kind: StockKind;
  nominal: string;
  lengthInput: string;
  length: number;
  widthInput: string;
  width: number;
  price: number;
  label: string;
}

interface CutPiece {
  id: number;
  kind: StockKind;
  nominal: string;
  lengthInput: string;
  length: number;
  widthInput: string;
  width: number;
  quantity: number;
  label: string;
  group: string;
}

let nextId = Date.now();
const genId = () => ++nextId;

// ──────────────────────────────────────────────
// Solver result types
// ──────────────────────────────────────────────

interface PlacedCut {
  cutId: number;
  label: string;
  length: number;
  offset: number;
  group: string;
}

interface UsedStock {
  stock: StockPiece;
  cuts: PlacedCut[];
  waste: number;
}

interface PlacedRect {
  cutId: number;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  group: string;
}

interface UsedSheet {
  stock: StockPiece;
  rects: PlacedRect[];
  wasteArea: number;
}

// ──────────────────────────────────────────────
// Solver strategy interfaces
// ──────────────────────────────────────────────

type CutRequest1D = { cutId: number; label: string; length: number; group: string };
type CutRequest2D = { cutId: number; label: string; w: number; h: number; group: string };

interface Solver1D {
  name: string;
  solve(stocks: StockPiece[], cuts: CutRequest1D[], kerf: number): UsedStock[] | null;
}

interface Solver2D {
  name: string;
  solve(stocks: StockPiece[], cuts: CutRequest2D[], kerf: number): UsedSheet[] | null;
}

// ──────────────────────────────────────────────
// 1D strategies
// ──────────────────────────────────────────────

function stocksByPricePerMm(stocks: StockPiece[]): StockPiece[] {
  return [...stocks].filter(s => s.length > 0)
    .sort((a, b) => (a.price / a.length) - (b.price / b.length));
}

type Bin1D = { stock: StockPiece; remaining: number; cuts: PlacedCut[] };

function placeCutInBin(bin: Bin1D, cut: CutRequest1D, kerf: number) {
  const offset = bin.stock.length - bin.remaining + (bin.cuts.length > 0 ? kerf : 0);
  const needed = cut.length + (bin.cuts.length > 0 ? kerf : 0);
  bin.cuts.push({ cutId: cut.cutId, label: cut.label, length: cut.length, offset, group: cut.group });
  bin.remaining -= needed;
}

function binHasGroup(bin: { cuts: PlacedCut[] } | { rects: PlacedRect[] }, group: string): boolean {
  if (!group) return false;
  if ('cuts' in bin) return bin.cuts.some(c => c.group === group);
  return bin.rects.some(r => r.group === group);
}

const ffd1D: Solver1D = {
  name: 'First-Fit Decreasing',
  solve(stocks, cuts, kerf) {
    const sorted = [...cuts].sort((a, b) => b.length - a.length);
    const sortedStocks = stocksByPricePerMm(stocks);
    if (sortedStocks.length === 0) return null;

    const bins: Bin1D[] = [];

    for (const cut of sorted) {
      let placed = false;
      for (const bin of bins) {
        const needed = cut.length + (bin.cuts.length > 0 ? kerf : 0);
        if (bin.remaining >= needed) {
          placeCutInBin(bin, cut, kerf);
          placed = true;
          break;
        }
      }
      if (!placed) {
        for (const stock of sortedStocks) {
          if (stock.length >= cut.length) {
            const bin: Bin1D = { stock: { ...stock }, remaining: stock.length, cuts: [] };
            placeCutInBin(bin, cut, kerf);
            bins.push(bin);
            placed = true;
            break;
          }
        }
      }
      if (!placed) return null;
    }
    return bins.map(b => ({ stock: b.stock, cuts: b.cuts, waste: b.remaining }));
  },
};

const bfd1D: Solver1D = {
  name: 'Best-Fit Decreasing',
  solve(stocks, cuts, kerf) {
    // Sort by group first (so same-group cuts are adjacent), then by length
    const sorted = [...cuts].sort((a, b) => {
      if (a.group && b.group && a.group !== b.group) return a.group.localeCompare(b.group);
      return b.length - a.length;
    });
    const availableStocks = [...stocks].filter(s => s.length > 0);
    if (availableStocks.length === 0) return null;

    const bins: Bin1D[] = [];

    for (const cut of sorted) {
      // Find the existing bin where the cut fits
      // Prefer bins that share the same affinity group, then least leftover
      let bestBinIdx = -1;
      let bestBinRemaining = Infinity;
      let bestHasAffinity = false;
      for (let i = 0; i < bins.length; i++) {
        const needed = cut.length + (bins[i].cuts.length > 0 ? kerf : 0);
        const after = bins[i].remaining - needed;
        if (after < 0) continue;
        const hasAffinity = binHasGroup(bins[i], cut.group);
        // Affinity match always wins; among equal affinity, pick tightest fit
        if (hasAffinity && !bestHasAffinity) {
          bestBinIdx = i; bestBinRemaining = after; bestHasAffinity = true;
        } else if (hasAffinity === bestHasAffinity && after < bestBinRemaining) {
          bestBinIdx = i; bestBinRemaining = after; bestHasAffinity = hasAffinity;
        }
      }

      if (bestBinIdx >= 0) {
        placeCutInBin(bins[bestBinIdx], cut, kerf);
        continue;
      }

      // No existing bin fits — pick the stock that leaves the least waste
      // Among ties, prefer cheapest
      let bestStock: StockPiece | null = null;
      let bestWaste = Infinity;
      let bestPrice = Infinity;
      for (const stock of availableStocks) {
        const waste = stock.length - cut.length;
        if (waste < 0) continue;
        if (waste < bestWaste || (waste === bestWaste && stock.price < bestPrice)) {
          bestWaste = waste;
          bestPrice = stock.price;
          bestStock = stock;
        }
      }
      if (!bestStock) return null;

      const bin: Bin1D = { stock: { ...bestStock }, remaining: bestStock.length, cuts: [] };
      placeCutInBin(bin, cut, kerf);
      bins.push(bin);
    }
    return bins.map(b => ({ stock: b.stock, cuts: b.cuts, waste: b.remaining }));
  },
};

// ──────────────────────────────────────────────
// 2D strategies
// ──────────────────────────────────────────────

function stocksByPricePerArea(stocks: StockPiece[]): StockPiece[] {
  return [...stocks].filter(s => s.length > 0 && s.width > 0)
    .sort((a, b) => (a.price / (a.length * a.width)) - (b.price / (b.length * b.width)));
}

// Shelf-based: simple rows across the sheet
const shelf2D: Solver2D = {
  name: 'Shelf (simple rows)',
  solve(stocks, cuts, kerf) {
    const sorted = [...cuts].sort((a, b) => {
      if (a.group && b.group && a.group !== b.group) return a.group.localeCompare(b.group);
      return Math.max(b.w, b.h) - Math.max(a.w, a.h);
    });
    const sortedStocks = stocksByPricePerArea(stocks);
    if (sortedStocks.length === 0) return null;

    interface Shelf { y: number; height: number; xUsed: number; }
    const bins: { stock: StockPiece; shelves: Shelf[]; rects: PlacedRect[] }[] = [];

    for (const cut of sorted) {
      let placed = false;
      const orientations: { w: number; h: number }[] =
        cut.w === cut.h ? [{ w: cut.w, h: cut.h }]
          : [{ w: cut.w, h: cut.h }, { w: cut.h, h: cut.w }];

      // Prefer bins with matching affinity group
      const binOrder: number[] = [];
      const affinityBins: number[] = [];
      const otherBins: number[] = [];
      for (let i = 0; i < bins.length; i++) {
        if (binHasGroup(bins[i], cut.group)) affinityBins.push(i);
        else otherBins.push(i);
      }
      binOrder.push(...affinityBins, ...otherBins);

      for (const bi of binOrder) {
        const bin = bins[bi];
        for (const ori of orientations) {
          if (ori.w > bin.stock.length || ori.h > bin.stock.width) continue;
          for (const shelf of bin.shelves) {
            const xStart = shelf.xUsed > 0 ? shelf.xUsed + kerf : 0;
            if (ori.h <= shelf.height && xStart + ori.w <= bin.stock.length) {
              bin.rects.push({ cutId: cut.cutId, label: cut.label, x: xStart, y: shelf.y, w: ori.w, h: ori.h, group: cut.group });
              shelf.xUsed = xStart + ori.w;
              placed = true;
              break;
            }
          }
          if (placed) break;
          const shelfY = bin.shelves.length === 0 ? 0
            : bin.shelves.at(-1)!.y + bin.shelves.at(-1)!.height + kerf;
          if (shelfY + ori.h <= bin.stock.width) {
            bin.shelves.push({ y: shelfY, height: ori.h, xUsed: ori.w });
            bin.rects.push({ cutId: cut.cutId, label: cut.label, x: 0, y: shelfY, w: ori.w, h: ori.h, group: cut.group });
            placed = true;
            break;
          }
        }
        if (placed) break;
      }

      if (!placed) {
        for (const stock of sortedStocks) {
          for (const ori of orientations) {
            if (ori.w <= stock.length && ori.h <= stock.width) {
              bins.push({
                stock: { ...stock },
                shelves: [{ y: 0, height: ori.h, xUsed: ori.w }],
                rects: [{ cutId: cut.cutId, label: cut.label, x: 0, y: 0, w: ori.w, h: ori.h, group: cut.group }],
              });
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      }
      if (!placed) return null;
    }
    return bins.map(b => {
      const usedArea = b.rects.reduce((s, r) => s + r.w * r.h, 0);
      return { stock: b.stock, rects: b.rects, wasteArea: b.stock.length * b.stock.width - usedArea };
    });
  },
};

// Guillotine: recursively splits free rectangles
const guillotine2D: Solver2D = {
  name: 'Guillotine (split free rects)',
  solve(stocks, cuts, kerf) {
    const sorted = [...cuts].sort((a, b) => {
      if (a.group && b.group && a.group !== b.group) return a.group.localeCompare(b.group);
      return (b.w * b.h) - (a.w * a.h);
    });
    const sortedStocks = stocksByPricePerArea(stocks);
    if (sortedStocks.length === 0) return null;

    interface FreeRect { x: number; y: number; w: number; h: number; }
    const bins: { stock: StockPiece; freeRects: FreeRect[]; rects: PlacedRect[] }[] = [];

    function findBestFit(freeRects: FreeRect[], w: number, h: number, kerf: number):
      { index: number; rotated: boolean } | null {
      let bestIdx = -1;
      let bestRotated = false;
      let bestShortSide = Infinity;

      for (let i = 0; i < freeRects.length; i++) {
        const fr = freeRects[i];
        // Account for kerf on the edges where we'll split
        const fw = fr.w;
        const fh = fr.h;

        for (const rot of [false, true]) {
          const pw = rot ? h : w;
          const ph = rot ? w : h;
          if (pw <= fw && ph <= fh) {
            const shortSide = Math.min(fw - pw, fh - ph);
            if (shortSide < bestShortSide) {
              bestShortSide = shortSide;
              bestIdx = i;
              bestRotated = rot;
            }
          }
        }
      }
      return bestIdx >= 0 ? { index: bestIdx, rotated: bestRotated } : null;
    }

    function splitRect(freeRects: FreeRect[], idx: number, pw: number, ph: number, kerf: number) {
      const fr = freeRects[idx];
      freeRects.splice(idx, 1);

      // Right remainder
      const rightW = fr.w - pw - kerf;
      if (rightW > kerf) {
        freeRects.push({ x: fr.x + pw + kerf, y: fr.y, w: rightW, h: ph });
      }
      // Bottom remainder
      const bottomH = fr.h - ph - kerf;
      if (bottomH > kerf) {
        freeRects.push({ x: fr.x, y: fr.y + ph + kerf, w: fr.w, h: bottomH });
      }
    }

    for (const cut of sorted) {
      let placed = false;

      // Try existing bins — prefer bins with matching affinity group
      // Two passes: first affinity matches, then any bin
      const binOrder: number[] = [];
      const affinityBins: number[] = [];
      const otherBins: number[] = [];
      for (let i = 0; i < bins.length; i++) {
        if (binHasGroup(bins[i], cut.group)) affinityBins.push(i);
        else otherBins.push(i);
      }
      binOrder.push(...affinityBins, ...otherBins);

      for (const bi of binOrder) {
        const bin = bins[bi];
        const fit = findBestFit(bin.freeRects, cut.w, cut.h, kerf);
        if (fit) {
          const pw = fit.rotated ? cut.h : cut.w;
          const ph = fit.rotated ? cut.w : cut.h;
          const fr = bin.freeRects[fit.index];
          bin.rects.push({ cutId: cut.cutId, label: cut.label, x: fr.x, y: fr.y, w: pw, h: ph, group: cut.group });
          splitRect(bin.freeRects, fit.index, pw, ph, kerf);
          placed = true;
          break;
        }
      }

      if (!placed) {
        for (const stock of sortedStocks) {
          const orientations: { pw: number; ph: number }[] =
            cut.w === cut.h ? [{ pw: cut.w, ph: cut.h }]
              : [{ pw: cut.w, ph: cut.h }, { pw: cut.h, ph: cut.w }];
          for (const ori of orientations) {
            if (ori.pw <= stock.length && ori.ph <= stock.width) {
              const freeRects: FreeRect[] = [];
              const rightW = stock.length - ori.pw - kerf;
              if (rightW > kerf) freeRects.push({ x: ori.pw + kerf, y: 0, w: rightW, h: ori.ph });
              const bottomH = stock.width - ori.ph - kerf;
              if (bottomH > kerf) freeRects.push({ x: 0, y: ori.ph + kerf, w: stock.length, h: bottomH });
              bins.push({
                stock: { ...stock },
                freeRects,
                rects: [{ cutId: cut.cutId, label: cut.label, x: 0, y: 0, w: ori.pw, h: ori.ph, group: cut.group }],
              });
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      }
      if (!placed) return null;
    }

    return bins.map(b => {
      const usedArea = b.rects.reduce((s, r) => s + r.w * r.h, 0);
      return { stock: b.stock, rects: b.rects, wasteArea: b.stock.length * b.stock.width - usedArea };
    });
  },
};

// ──────────────────────────────────────────────
// Strategy registry
// ──────────────────────────────────────────────

const STRATEGIES_1D: Solver1D[] = [bfd1D, ffd1D];
const STRATEGIES_2D: Solver2D[] = [guillotine2D, shelf2D];

// ──────────────────────────────────────────────
// Combined solver: group by nominal, solve each
// ──────────────────────────────────────────────

interface SolutionGroup {
  nominal: string;
  kind: StockKind;
  lumberResults?: UsedStock[];
  sheetResults?: UsedSheet[];
  cost: number;
  error?: string;
}

interface Solution {
  groups: SolutionGroup[];
  totalCost: number;
}

function solveAll(
  stocks: StockPiece[], cuts: CutPiece[], kerf: number,
  clearance: number, solver1d: Solver1D, solver2d: Solver2D,
  simplifyToFractions?: boolean, fractionTolerance?: number,
): Solution | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

  // Group cuts by (kind, nominal) so lumber "2x4" and sheet "2x4" stay separate
  const groupKeys = new Set(
    cuts.filter(c => c.length > 0).map(c => `${c.kind}::${norm(c.nominal)}`)
  );
  if (groupKeys.size === 0) return null;

  const groups: SolutionGroup[] = [];

  for (const gk of groupKeys) {
    const [kind, nom] = gk.split('::') as [StockKind, string];
    const matchingStocks = stocks.filter(s => s.kind === kind && norm(s.nominal) === nom && s.length > 0);
    const matchingCuts = cuts.filter(c => c.kind === kind && norm(c.nominal) === nom && c.length > 0);

    if (matchingStocks.length === 0) {
      groups.push({ nominal: nom, kind, cost: 0, error: `No stock available for "${nom}"` });
      continue;
    }

    const stockLengths = [...new Set(matchingStocks.map(s => s.length))];
    const stockWidths = [...new Set(matchingStocks.filter(s => s.width > 0).map(s => s.width))];

    const expanded = matchingCuts.flatMap(c => {
      let cutLen = c.length + clearance;
      let cutH = c.width > 0 ? c.width + clearance : 0;

      if (simplifyToFractions && fractionTolerance && fractionTolerance > 0) {
        const fracL = findBestFraction(cutLen, stockLengths, fractionTolerance, kerf);
        if (fracL) cutLen = fracL.simplifiedLength;
        if (cutH > 0) {
          const fracH = findBestFraction(cutH, [...stockLengths, ...stockWidths], fractionTolerance, kerf);
          if (fracH) cutH = fracH.simplifiedLength;
        }
      }

      return Array.from({ length: c.quantity }, () => ({
        cutId: c.id, label: c.label, group: c.group ?? '',
        length: cutLen, w: cutLen, h: cutH,
      }));
    });

    if (kind === 'sheet') {
      const result = solver2d.solve(matchingStocks, expanded, kerf);
      if (!result) {
        groups.push({ nominal: nom, kind, cost: 0, error: `Cannot fit all cuts for "${nom}"` });
      } else {
        const cost = result.reduce((s, u) => s + u.stock.price, 0);
        groups.push({ nominal: nom, kind, sheetResults: result, cost });
      }
    } else {
      const result = solver1d.solve(matchingStocks, expanded, kerf);
      if (!result) {
        groups.push({ nominal: nom, kind, cost: 0, error: `Cannot fit all cuts for "${nom}"` });
      } else {
        const cost = result.reduce((s, u) => s + u.stock.price, 0);
        groups.push({ nominal: nom, kind, lumberResults: result, cost });
      }
    }
  }

  const totalCost = groups.reduce((s, g) => s + g.cost, 0);
  return { groups, totalCost };
}

// ──────────────────────────────────────────────
// Cut diagram (1D lumber)
// ──────────────────────────────────────────────

const LumberDiagram: React.FC<{ results: UsedStock[] }> = ({ results }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textColor = useColorModeValue('#1a202c', '#e2e8f0');
  const stockColor = useColorModeValue('#e2e8f0', '#2d3748');
  const wasteColor = useColorModeValue('#fed7d7', '#63171b');
  const kerfColor = useColorModeValue('#a0aec0', '#4a5568');
  const palette = ['#3182ce', '#38a169', '#d69e2e', '#e53e3e', '#805ad5', '#dd6b20', '#319795', '#d53f8c'];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ROW_H = 40, LABEL_W = 130, PAD = 16, GAP = 10;
    const barW = canvas.width - LABEL_W - PAD * 2;
    canvas.height = PAD * 2 + results.length * (ROW_H + GAP);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const maxLen = Math.max(...results.map(u => u.stock.length));

    results.forEach((used, i) => {
      const y = PAD + i * (ROW_H + GAP);
      const scale = barW / maxLen;
      const stockW = used.stock.length * scale;

      ctx.fillStyle = stockColor;
      ctx.fillRect(LABEL_W, y, stockW, ROW_H);
      ctx.strokeStyle = kerfColor;
      ctx.strokeRect(LABEL_W, y, stockW, ROW_H);

      for (const cut of used.cuts) {
        const x = LABEL_W + cut.offset * scale;
        const w = cut.length * scale;
        ctx.fillStyle = palette[cut.cutId % palette.length];
        ctx.fillRect(x, y, w, ROW_H);
        ctx.fillStyle = '#fff';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const t = `${cut.label} (${formatMm(cut.length)})`;
        if (ctx.measureText(t).width < w - 4) ctx.fillText(t, x + w / 2, y + ROW_H / 2);
      }

      const usedLen = used.stock.length - used.waste;
      if (used.waste > 0) {
        const wx = LABEL_W + usedLen * scale;
        const ww = used.waste * scale;
        ctx.fillStyle = wasteColor;
        ctx.fillRect(wx, y, ww, ROW_H);
        ctx.fillStyle = textColor;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (ww > 30) ctx.fillText(formatMm(used.waste), wx + ww / 2, y + ROW_H / 2);
      }

      ctx.fillStyle = textColor;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${used.stock.label} ${formatLength(used.stock.length)}`, LABEL_W - 8, y + ROW_H / 2);
    });
  }, [results, textColor, stockColor, wasteColor, kerfColor]);

  return <canvas ref={canvasRef} width={700} height={200} style={{ width: '100%', maxWidth: 700 }} />;
};

// ──────────────────────────────────────────────
// Cut diagram (2D sheets)
// ──────────────────────────────────────────────

const SingleSheetCanvas: React.FC<{ used: UsedSheet; index: number }> = ({ used, index }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textColor = useColorModeValue('#1a202c', '#e2e8f0');
  const stockColor = useColorModeValue('#e2e8f0', '#2d3748');
  const kerfColor = useColorModeValue('#a0aec0', '#4a5568');
  const labelBg = useColorModeValue('gray.100', 'gray.700');
  const palette = ['#3182ce', '#38a169', '#d69e2e', '#e53e3e', '#805ad5', '#dd6b20', '#319795', '#d53f8c'];

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const containerW = container.clientWidth;
    const PAD = 8;
    const drawW = containerW - PAD * 2;
    const aspect = used.stock.width / used.stock.length;
    const drawH = drawW * aspect;
    const scale = drawW / used.stock.length;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = (drawW + PAD * 2) * dpr;
    canvas.height = (drawH + PAD * 2) * dpr;
    canvas.style.width = `${drawW + PAD * 2}px`;
    canvas.style.height = `${drawH + PAD * 2}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, drawW + PAD * 2, drawH + PAD * 2);

    ctx.fillStyle = stockColor;
    ctx.fillRect(PAD, PAD, drawW, drawH);
    ctx.strokeStyle = kerfColor;
    ctx.strokeRect(PAD, PAD, drawW, drawH);

    for (const r of used.rects) {
      const rx = PAD + r.x * scale;
      const ry = PAD + r.y * scale;
      const rw = r.w * scale;
      const rh = r.h * scale;
      ctx.fillStyle = palette[r.cutId % palette.length];
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = kerfColor;
      ctx.strokeRect(rx, ry, rw, rh);

      ctx.fillStyle = '#fff';
      const fontSize = Math.max(10, Math.min(14, Math.min(rw, rh) * 0.3));
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = r.label;
      const dims = `${formatMm(r.w)}×${formatMm(r.h)}`;
      if (ctx.measureText(label).width < rw - 6 && fontSize + 4 < rh) {
        ctx.fillText(label, rx + rw / 2, ry + rh / 2 - fontSize * 0.5);
        ctx.font = `${Math.max(9, fontSize - 2)}px sans-serif`;
        if (ctx.measureText(dims).width < rw - 6) {
          ctx.fillText(dims, rx + rw / 2, ry + rh / 2 + fontSize * 0.5);
        }
      } else if (ctx.measureText(label).width < rw - 4 && fontSize < rh) {
        ctx.fillText(label, rx + rw / 2, ry + rh / 2);
      }
    }
  }, [used, textColor, stockColor, kerfColor]);

  const wasteArea = used.wasteArea;
  const totalArea = used.stock.length * used.stock.width;
  const utilPct = (100 * (1 - wasteArea / totalArea)).toFixed(1);

  return (
    <Box ref={containerRef} flex="1 1 400px" minW="300px">
      <Box px={2} py={1} borderRadius="md" bg={labelBg} mb={1}>
        <Flex justify="space-between" align="center">
          <Text fontSize="sm" fontWeight="semibold">
            Sheet {index + 1}: {used.stock.label} — ${used.stock.price.toFixed(2)}
          </Text>
          <Text fontSize="xs" color="gray.500">{utilPct}% used</Text>
        </Flex>
      </Box>
      <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} />
    </Box>
  );
};

const SheetDiagram: React.FC<{ results: UsedSheet[] }> = ({ results }) => (
  <Flex wrap="wrap" gap={4}>
    {results.map((used, i) => (
      <SingleSheetCanvas key={i} used={used} index={i} />
    ))}
  </Flex>
);

// ──────────────────────────────────────────────
// Editable tables
// ──────────────────────────────────────────────

const KERF = 3;

type Updater<T> = (value: T | ((prev: T) => T)) => void;

const StockTable: React.FC<{
  items: StockPiece[];
  onChange: Updater<StockPiece[]>;
  readOnly?: boolean;
}> = ({ items, onChange, readOnly }) => {
  const headerBg = useColorModeValue('gray.100', 'gray.700');

  const update = (id: number, patch: Partial<StockPiece>) => {
    onChange(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  };

  const updateNominal = (id: number, nominal: string) => {
    onChange(prev => prev.map(i => {
      if (i.id !== id) return i;
      return { ...i, nominal };
    }));
  };

  const updateKind = (id: number, kind: StockKind) => {
    onChange(prev => prev.map(i => {
      if (i.id !== id) return i;
      if (kind === 'lumber') {
        return { ...i, kind, widthInput: '', width: 0 };
      }
      return { ...i, kind };
    }));
  };

  const updateLength = (id: number, input: string) => {
    update(id, { lengthInput: input, length: parseLength(input) ?? 0 });
  };

  const updateWidth = (id: number, input: string) => {
    update(id, { widthInput: input, width: parseLength(input) ?? 0 });
  };

  const remove = (id: number) => onChange(prev => prev.filter(i => i.id !== id));

  const addLumber = () => onChange(prev => [...prev, {
    id: genId(), kind: 'lumber' as StockKind, nominal: '2x4', lengthInput: '8ft', length: 8 * MM_PER_FOOT,
    widthInput: '', width: 0, price: 0, label: '2x4 lumber',
  }]);

  const addSheet = () => onChange(prev => [...prev, {
    id: genId(), kind: 'sheet' as StockKind, nominal: 'ply 3/4', lengthInput: '8ft', length: 8 * MM_PER_FOOT,
    widthInput: '4ft', width: 4 * MM_PER_FOOT, price: 0, label: 'ply 3/4',
  }]);

  return (
    <VStack align="stretch" gap={0}>
      <Grid templateColumns={readOnly ? "90px 80px 1fr 100px 100px 90px" : "90px 80px 1fr 100px 100px 90px 40px"} gap={2} px={2} py={1} bg={headerBg} borderRadius="md">
        <Text fontWeight="semibold" fontSize="sm">Type</Text>
        <Text fontWeight="semibold" fontSize="sm">Size</Text>
        <Text fontWeight="semibold" fontSize="sm">Label</Text>
        <Text fontWeight="semibold" fontSize="sm">Length</Text>
        <Text fontWeight="semibold" fontSize="sm">Width</Text>
        <Text fontWeight="semibold" fontSize="sm">Price</Text>
        {!readOnly && <Box />}
      </Grid>
      {items.map(item => {
        const info = lookupNominal(item.nominal);
        const isSheet = item.kind === 'sheet';
        const tooltip = info ? nominalTooltip(info) + ` | ${formatLength(item.length)} (${formatMm(item.length)})` : undefined;
        const lengthOk = item.length > 0;
        return (
          <Grid key={item.id} templateColumns={readOnly ? "90px 80px 1fr 100px 100px 90px" : "90px 80px 1fr 100px 100px 90px 40px"} gap={2} px={2} py={1}
            alignItems="center" title={tooltip} cursor="default">
            <select value={item.kind}
              disabled={readOnly}
              onChange={e => updateKind(item.id, e.target.value as StockKind)}
              style={{ fontSize: '0.875rem', padding: '4px 2px', borderRadius: 4, border: '1px solid #ccc', background: 'transparent', color: 'inherit', width: '100%' }}>
              {STOCK_KINDS.map(k => <option key={k} value={k}>{k === 'lumber' ? 'Lumber' : 'Sheet'}</option>)}
            </select>
            <Input size="sm" value={item.nominal} placeholder="2x4" readOnly={readOnly}
              onChange={e => updateNominal(item.id, e.target.value)} />
            <Input size="sm" value={item.label} placeholder="Label" readOnly={readOnly}
              onChange={e => update(item.id, { label: e.target.value })} />
            <Input size="sm" value={item.lengthInput} placeholder="8ft" readOnly={readOnly}
              borderColor={!lengthOk && item.lengthInput ? 'red.400' : undefined}
              onChange={e => updateLength(item.id, e.target.value)} />
            <Input size="sm" value={item.widthInput} placeholder={isSheet ? '4ft' : '—'}
              disabled={!isSheet} readOnly={readOnly}
              onChange={e => updateWidth(item.id, e.target.value)} />
            <Input size="sm" type="number" step="0.01" value={item.price} readOnly={readOnly}
              onChange={e => update(item.id, { price: Number(e.target.value) })} />
            {!readOnly && (
              <IconButton size="xs" variant="ghost" aria-label="Remove" onClick={() => remove(item.id)}>
                <Trash size={14} />
              </IconButton>
            )}
          </Grid>
        );
      })}
      {!readOnly && (
        <HStack mt={1} gap={2}>
          <Button size="sm" variant="outline" onClick={addLumber}>
            <Plus size={14} /> Lumber
          </Button>
          <Button size="sm" variant="outline" onClick={addSheet}>
            <Plus size={14} /> Sheet
          </Button>
        </HStack>
      )}
    </VStack>
  );
};

const CutTable: React.FC<{
  items: CutPiece[];
  stocks: StockPiece[];
  onChange: Updater<CutPiece[]>;
  readOnly?: boolean;
}> = ({ items, stocks, onChange, readOnly }) => {
  const headerBg = useColorModeValue('gray.100', 'gray.700');
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

  const availableNominals = useMemo(() => {
    const set = new Set(stocks.map(s => norm(s.nominal)));
    return [...set].sort();
  }, [stocks]);

  const nominalsForKind = useCallback((kind: StockKind) => {
    const set = new Set(stocks.filter(s => s.kind === kind).map(s => norm(s.nominal)));
    return [...set].sort();
  }, [stocks]);

  const update = (id: number, patch: Partial<CutPiece>) => {
    onChange(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  };
  const updateKind = (id: number, kind: StockKind) => {
    onChange(prev => prev.map(i => {
      if (i.id !== id) return i;
      const noms = nominalsForKind(kind);
      const nominal = noms[0] || i.nominal;
      if (kind === 'lumber') {
        return { ...i, kind, nominal, widthInput: '', width: 0 };
      }
      return { ...i, kind, nominal };
    }));
  };
  const updateLength = (id: number, input: string) => {
    update(id, { lengthInput: input, length: parseLength(input) ?? 0 });
  };
  const updateWidth = (id: number, input: string) => {
    update(id, { widthInput: input, width: parseLength(input) ?? 0 });
  };
  const remove = (id: number) => onChange(prev => prev.filter(i => i.id !== id));
  const add = () => {
    const defaultNom = availableNominals[0] || '2x4';
    const stockMatch = stocks.find(s => norm(s.nominal) === defaultNom);
    const kind: StockKind = stockMatch?.kind ?? 'lumber';
    const isSheet = kind === 'sheet';
    onChange(prev => [...prev, {
      id: genId(), kind, nominal: defaultNom,
      lengthInput: '600mm', length: 600,
      widthInput: isSheet ? '300mm' : '', width: isSheet ? 300 : 0,
      quantity: 1, label: '', group: '',
    }]);
  };

  return (
    <VStack align="stretch" gap={0}>
      <Grid templateColumns={readOnly ? "90px 80px 1fr 100px 100px 60px 70px" : "90px 80px 1fr 100px 100px 60px 70px 40px"} gap={2} px={2} py={1} bg={headerBg} borderRadius="md">
        <Text fontWeight="semibold" fontSize="sm">Type</Text>
        <Text fontWeight="semibold" fontSize="sm">Size</Text>
        <Text fontWeight="semibold" fontSize="sm">Label</Text>
        <Text fontWeight="semibold" fontSize="sm">Length</Text>
        <Text fontWeight="semibold" fontSize="sm">Width</Text>
        <Text fontWeight="semibold" fontSize="sm">Qty</Text>
        <Text fontWeight="semibold" fontSize="sm">Group</Text>
        {!readOnly && <Box />}
      </Grid>
      {items.map(item => {
        const isSheet = item.kind === 'sheet';
        const lengthOk = item.length > 0;
        const tooltip = lengthOk
          ? `${formatLength(item.length)} (${formatMm(item.length)})` + (isSheet && item.width > 0 ? ` × ${formatLength(item.width)} (${formatMm(item.width)})` : '')
          : undefined;
        const kindNominals = nominalsForKind(item.kind);
        return (
          <Grid key={item.id} templateColumns={readOnly ? "90px 80px 1fr 100px 100px 60px 70px" : "90px 80px 1fr 100px 100px 60px 70px 40px"} gap={2} px={2} py={1}
            alignItems="center" title={tooltip} cursor="default">
            <select value={item.kind}
              disabled={readOnly}
              onChange={e => updateKind(item.id, e.target.value as StockKind)}
              style={{ fontSize: '0.875rem', padding: '4px 2px', borderRadius: 4, border: '1px solid #ccc', background: 'transparent', color: 'inherit', width: '100%' }}>
              {STOCK_KINDS.map(k => <option key={k} value={k}>{k === 'lumber' ? 'Lumber' : 'Sheet'}</option>)}
            </select>
            <select
              value={item.nominal}
              disabled={readOnly}
              onChange={e => update(item.id, { nominal: e.target.value })}
              style={{ fontSize: '0.875rem', padding: '4px 2px', borderRadius: 4, border: '1px solid #ccc', background: 'transparent', color: 'inherit', width: '100%' }}
            >
              {kindNominals.map(n => <option key={n} value={n}>{n}</option>)}
              {!kindNominals.includes(norm(item.nominal)) && (
                <option value={item.nominal}>{item.nominal}</option>
              )}
            </select>
            <Input size="sm" value={item.label} placeholder="e.g. Shelf" readOnly={readOnly}
              onChange={e => update(item.id, { label: e.target.value })} />
            <Input size="sm" value={item.lengthInput} placeholder="24in" readOnly={readOnly}
              borderColor={!lengthOk && item.lengthInput ? 'red.400' : undefined}
              onChange={e => updateLength(item.id, e.target.value)} />
            <Input size="sm" value={item.widthInput} placeholder={isSheet ? '12in' : '—'}
              disabled={!isSheet} readOnly={readOnly}
              onChange={e => updateWidth(item.id, e.target.value)} />
            <Input size="sm" type="number" min={1} value={item.quantity} readOnly={readOnly}
              onChange={e => update(item.id, { quantity: Math.max(1, Number(e.target.value)) })} />
            <Input size="sm" value={item.group} placeholder="—" readOnly={readOnly}
              onChange={e => update(item.id, { group: e.target.value })} />
            {!readOnly && (
              <IconButton size="xs" variant="ghost" aria-label="Remove" onClick={() => remove(item.id)}>
                <Trash size={14} />
              </IconButton>
            )}
          </Grid>
        );
      })}
      {!readOnly && (
        <Button size="sm" variant="outline" onClick={add} mt={1}>
          <Plus size={14} /> Add Cut
        </Button>
      )}
    </VStack>
  );
};

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────

const COLLECTION = 'wood-planner';

const DEFAULT_STOCKS: StockPiece[] = [
  { id: genId(), kind: 'lumber', nominal: '2x4', lengthInput: '8ft', length: 8 * MM_PER_FOOT, widthInput: '', width: 0, price: 8.50, label: '2x4 lumber' },
  { id: genId(), kind: 'lumber', nominal: '2x4', lengthInput: '10ft', length: 10 * MM_PER_FOOT, widthInput: '', width: 0, price: 12.00, label: '2x4 lumber' },
];

const DEFAULT_CUTS: CutPiece[] = [
  { id: genId(), kind: 'lumber', nominal: '2x4', lengthInput: '600mm', length: 600, widthInput: '', width: 0, quantity: 4, label: 'Legs', group: '' },
  { id: genId(), kind: 'lumber', nominal: '2x4', lengthInput: '1100mm', length: 1100, widthInput: '', width: 0, quantity: 2, label: 'Rails', group: '' },
  { id: genId(), kind: 'lumber', nominal: '2x4', lengthInput: '500mm', length: 500, widthInput: '', width: 0, quantity: 3, label: 'Stretchers', group: '' },
];

const DEFAULT_CLEARANCE = MM_PER_INCH / 8; // 1/8" ≈ 3.175mm

interface PlannerData {
  stocks: StockPiece[];
  cuts: CutPiece[];
  kerf: number;
  taxRate?: number;
  clearance?: number;
  simplifyFractions?: boolean;
  fractionTolerance?: number;
  imperialRes?: number;
}

const WoodPlanner: React.FC = () => {
  const { project: urlProject } = useParams<{ project?: string }>();
  const navigate = useNavigate();

  const [kerf, setKerf] = useState(KERF);
  const [clearance, setClearance] = useState(DEFAULT_CLEARANCE);
  const [taxRate, setTaxRate] = useState(14.975);
  const [stocks, setStocks] = useState<StockPiece[]>(DEFAULT_STOCKS);
  const [cuts, setCuts] = useState<CutPiece[]>(DEFAULT_CUTS);
  const [strategy1dIdx, setStrategy1dIdx] = useState(0);
  const [strategy2dIdx, setStrategy2dIdx] = useState(0);
  const [simplifyFractions, setSimplifyFractions] = useState(false);
  const [fractionTolerance, setFractionTolerance] = useState(20);
  const [imperialRes, setImperialRes] = useState(8);

  const [projectName, setProjectName] = useState('');
  const [savedProjects, setSavedProjects] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const markDirty = useCallback(<T,>(setter: React.Dispatch<React.SetStateAction<T>>) => {
    return (value: T | ((prev: T) => T)) => {
      setter(value);
      setDirty(true);
    };
  }, []);

  const setStocksDirty = useMemo(() => markDirty(setStocks), [markDirty]);
  const setCutsDirty = useMemo(() => markDirty(setCuts), [markDirty]);
  const setKerfDirty = useMemo(() => markDirty(setKerf), [markDirty]);
  const setClearanceDirty = useMemo(() => markDirty(setClearance), [markDirty]);
  const setTaxRateDirty = useMemo(() => markDirty(setTaxRate), [markDirty]);
  const setSimplifyFractionsDirty = useMemo(() => markDirty(setSimplifyFractions), [markDirty]);
  const setFractionToleranceDirty = useMemo(() => markDirty(setFractionTolerance), [markDirty]);
  const setImperialResDirty = useMemo(() => markDirty(setImperialRes), [markDirty]);

  const doLoadProject = useCallback(async (name: string) => {
    try {
      const data = await jsonStore.get<PlannerData>(COLLECTION, name);
      setStocks((data.stocks ?? DEFAULT_STOCKS).map(s => ({
        ...s,
        kind: s.kind ?? (lookupNominal(s.nominal ?? '')?.kind) ?? ((s.width ?? 0) > 0 ? 'sheet' : 'lumber') as StockKind,
        nominal: s.nominal ?? '', lengthInput: s.lengthInput ?? `${s.length}mm`,
        widthInput: s.widthInput ?? (s.width ? `${s.width}mm` : ''), width: s.width ?? 0,
      })));
      setCuts((data.cuts ?? DEFAULT_CUTS).map(c => ({
        ...c,
        kind: c.kind ?? (lookupNominal(c.nominal ?? '')?.kind) ?? ((c.width ?? 0) > 0 ? 'sheet' : 'lumber') as StockKind,
        nominal: c.nominal ?? '2x4', lengthInput: c.lengthInput ?? `${c.length}mm`,
        widthInput: c.widthInput ?? (c.width ? `${c.width}mm` : ''), width: c.width ?? 0,
        group: c.group ?? '',
      })));
      setKerf(data.kerf ?? KERF);
      setClearance(data.clearance ?? DEFAULT_CLEARANCE);
      setTaxRate(data.taxRate ?? 14.975);
      setSimplifyFractions(data.simplifyFractions ?? false);
      setFractionTolerance(data.fractionTolerance ?? 20);
      setImperialRes(data.imperialRes ?? 8);
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
      await jsonStore.put(COLLECTION, name, { stocks, cuts, kerf, taxRate, clearance, simplifyFractions, fractionTolerance, imperialRes } as PlannerData);
      setDirty(false);
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(null), 2000);
      if (!savedProjects.includes(name)) setSavedProjects(prev => [...prev, name].sort());
      navigate(`/scratch/wood-planner/${encodeURIComponent(name)}`, { replace: true });
    } catch {
      setSaveStatus('Save failed');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const loadProject = (name: string) => {
    navigate(`/scratch/wood-planner/${encodeURIComponent(name)}`);
  };

  const solver1d = STRATEGIES_1D[strategy1dIdx] ?? STRATEGIES_1D[0];
  const solver2d = STRATEGIES_2D[strategy2dIdx] ?? STRATEGIES_2D[0];
  const solution = useMemo(
    () => solveAll(stocks, cuts, kerf, clearance, solver1d, solver2d, simplifyFractions, fractionTolerance),
    [stocks, cuts, kerf, clearance, solver1d, solver2d, simplifyFractions, fractionTolerance],
  );

  const summaryBg = useColorModeValue('blue.50', 'blue.900');
  const errorBg = useColorModeValue('red.50', 'red.900');
  const toolbarBg = useColorModeValue('gray.50', 'gray.800');
  const headerBg = useColorModeValue('gray.100', 'gray.700');

  const totalCutCount = cuts.reduce((s, c) => s + c.quantity, 0);

  const shoppingList = useMemo(() => {
    if (!solution) return [];
    const map = new Map<string, { label: string; nominal: string; kind: StockKind; length: number; width: number; price: number; count: number }>();
    for (const g of solution.groups) {
      const items: { stock: StockPiece }[] = [...(g.lumberResults ?? []), ...(g.sheetResults ?? [])];
      for (const used of items) {
        const s = used.stock;
        const key = `${s.kind}::${s.nominal}::${s.label}::${s.length}::${s.width}::${s.price}`;
        const existing = map.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(key, { label: s.label, nominal: s.nominal, kind: s.kind, length: s.length, width: s.width, price: s.price, count: 1 });
        }
      }
    }
    return [...map.values()].sort((a, b) => a.nominal.localeCompare(b.nominal) || a.label.localeCompare(b.label));
  }, [solution]);

  const cutListSummary = useMemo(() => {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const grouped = new Map<string, CutPiece[]>();
    for (const c of cuts) {
      if (c.length <= 0) continue;
      const key = `${c.kind}::${norm(c.nominal)}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(c);
    }
    return [...grouped.entries()].map(([key, items]) => {
      const [kind, nominal] = key.split('::') as [StockKind, string];
      return { kind, nominal, items };
    }).sort((a, b) => a.nominal.localeCompare(b.nominal));
  }, [cuts]);

  const fractionInfo = useMemo(() => {
    if (!simplifyFractions || fractionTolerance <= 0) return new Map<number, FractionMatch>();
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const map = new Map<number, FractionMatch>();
    for (const c of cuts) {
      if (c.length <= 0) continue;
      const matchingStockLengths = [...new Set(
        stocks.filter(s => s.kind === c.kind && norm(s.nominal) === norm(c.nominal) && s.length > 0)
          .map(s => s.length)
      )];
      if (matchingStockLengths.length === 0) continue;
      const cutLen = c.length + clearance;
      const frac = findBestFraction(cutLen, matchingStockLengths, fractionTolerance, kerf);
      if (frac) map.set(c.id, frac);
    }
    return map;
  }, [cuts, stocks, clearance, kerf, simplifyFractions, fractionTolerance]);

  return (
    <Box maxW="5xl" mx="auto" p={6}>
      <Heading size="lg" mb={6}>Wood Planner</Heading>

      <Box p={3} mb={6} borderRadius="md" bg={toolbarBg} borderWidth="1px">
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

      <VStack align="stretch" gap={8}>
        <Box>
          <Heading size="md" mb={3}>Available Stock</Heading>
          <Text fontSize="sm" color="gray.500" mb={2}>
            Lumber and sheet goods from your supplier. Hover a row for actual dimensions.
          </Text>
          <StockTable items={stocks} onChange={setStocksDirty} readOnly={isStaticMode} />
        </Box>

        <Box>
          <Heading size="md" mb={3}>Required Cuts</Heading>
          <Text fontSize="sm" color="gray.500" mb={2}>
            Parts you need ({totalCutCount} pieces). Each cut uses a stock size. Hover for converted dimensions.
          </Text>
          <CutTable items={cuts} stocks={stocks} onChange={setCutsDirty} readOnly={isStaticMode} />
        </Box>

        <Flex gap={6} align="center" wrap="wrap">
          <HStack gap={2} align="center">
            <Text fontWeight="semibold" whiteSpace="nowrap" fontSize="sm">Saw kerf (mm):</Text>
            <Input type="number" step="0.5" min="0" value={kerf} readOnly={isStaticMode}
              onChange={e => setKerfDirty(Math.max(0, Number(e.target.value)))} w="100px" size="sm" />
          </HStack>
          <HStack gap={2} align="center">
            <Text fontWeight="semibold" whiteSpace="nowrap" fontSize="sm">Clearance (mm):</Text>
            <Input type="number" step="0.1" min="0" value={Number(clearance.toFixed(2))} readOnly={isStaticMode}
              onChange={e => setClearanceDirty(Math.max(0, Number(e.target.value)))} w="100px" size="sm" />
          </HStack>
          <HStack gap={2} align="center">
            <Text fontWeight="semibold" whiteSpace="nowrap" fontSize="sm">Tax (%):</Text>
            <Input type="number" step="0.1" min="0" value={taxRate} readOnly={isStaticMode}
              onChange={e => setTaxRateDirty(Math.max(0, Number(e.target.value)))} w="100px" size="sm" />
          </HStack>
          {STRATEGIES_1D.length > 1 && (
            <HStack gap={2} align="center">
              <Text fontWeight="semibold" whiteSpace="nowrap" fontSize="sm">Lumber strategy:</Text>
              <select value={strategy1dIdx}
                onChange={e => setStrategy1dIdx(Number(e.target.value))}
                style={{ fontSize: '0.875rem', padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', background: 'transparent', color: 'inherit' }}>
                {STRATEGIES_1D.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
              </select>
            </HStack>
          )}
          <HStack gap={2} align="center">
            <Text fontWeight="semibold" whiteSpace="nowrap" fontSize="sm">Sheet strategy:</Text>
            <select value={strategy2dIdx}
              onChange={e => setStrategy2dIdx(Number(e.target.value))}
              style={{ fontSize: '0.875rem', padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', background: 'transparent', color: 'inherit' }}>
              {STRATEGIES_2D.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
            </select>
          </HStack>
          <HStack gap={2} align="center">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={simplifyFractions}
                disabled={isStaticMode}
                onChange={e => setSimplifyFractionsDirty(e.target.checked)} />
              <Text fontWeight="semibold" whiteSpace="nowrap" fontSize="sm">Simplify to fractions</Text>
            </label>
            {simplifyFractions && (
              <>
                <Text whiteSpace="nowrap" fontSize="sm">±</Text>
                <Input type="number" step="1" min="1" value={fractionTolerance} readOnly={isStaticMode}
                  onChange={e => setFractionToleranceDirty(Math.max(1, Number(e.target.value)))} w="70px" size="sm" />
                <Text fontSize="sm" whiteSpace="nowrap">mm</Text>
              </>
            )}
          </HStack>
          <HStack gap={2} align="center">
            <Text fontWeight="semibold" whiteSpace="nowrap" fontSize="sm">Resolution:</Text>
            <select value={imperialRes}
              onChange={e => setImperialResDirty(Number(e.target.value))}
              style={{ fontSize: '0.875rem', padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', background: 'transparent', color: 'inherit' }}>
              <option value={2}>1/2"</option>
              <option value={4}>1/4"</option>
              <option value={8}>1/8"</option>
              <option value={16}>1/16"</option>
            </select>
          </HStack>
        </Flex>

        {solution && solution.groups.length > 0 && (
          <Box>
            <Heading size="md" mb={3}>Optimized Cut Plan</Heading>
            <Box p={4} borderRadius="md" bg={summaryBg} mb={4}>
              <Flex gap={8} align="baseline" wrap="wrap">
                <Text fontSize="sm">Material: <b>${solution.totalCost.toFixed(2)}</b></Text>
                <Text fontSize="sm">Tax ({taxRate}%): <b>${(solution.totalCost * taxRate / 100).toFixed(2)}</b></Text>
                <Text fontSize="2xl" fontWeight="bold">
                  Total: ${(solution.totalCost * (1 + taxRate / 100)).toFixed(2)}
                </Text>
              </Flex>
            </Box>

            <VStack align="stretch" gap={4} mb={4}>
              <Box borderWidth="1px" borderRadius="md" p={4}>
                <Flex justify="space-between" align="center" mb={3}>
                  <Heading size="sm">Shopping List</Heading>
                  <Button size="xs" variant="outline" onClick={() => {
                    const rows = [['Qty', 'Item', 'Dimensions', 'Unit $', 'Subtotal']];
                    for (const item of shoppingList) {
                      const dims = `${formatLength(item.length)}${item.width > 0 ? ` × ${formatLength(item.width)}` : ''}`;
                      rows.push([String(item.count), item.label, dims, item.price.toFixed(2), (item.count * item.price).toFixed(2)]);
                    }
                    rows.push(['', '', '', 'Total', solution!.totalCost.toFixed(2)]);
                    navigator.clipboard.writeText(rows.map(r => r.join('\t')).join('\n'));
                  }}>
                    <Copy size={12} /> Copy
                  </Button>
                </Flex>
                <Box overflowX="auto">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr>
                        {['Qty', 'Item', 'Dimensions', 'Unit $', 'Subtotal'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shoppingList.map((item, i) => (
                        <tr key={i}>
                          <td style={{ padding: '4px 8px', fontWeight: 700 }}>{item.count}</td>
                          <td style={{ padding: '4px 8px' }}>{item.label}</td>
                          <td style={{ padding: '4px 8px' }}>
                            {formatLength(item.length)}{item.width > 0 ? ` × ${formatLength(item.width)}` : ''}
                          </td>
                          <td style={{ padding: '4px 8px' }}>${item.price.toFixed(2)}</td>
                          <td style={{ padding: '4px 8px', fontWeight: 600 }}>${(item.count * item.price).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              </Box>

              <Box borderWidth="1px" borderRadius="md" p={4}>
                <Flex justify="space-between" align="center" mb={3}>
                  <Heading size="sm">Cut List ({totalCutCount} pieces)</Heading>
                  <Button size="xs" variant="outline" onClick={() => {
                    const hasFracs = fractionInfo.size > 0;
                    const headers = ['Size', 'Qty', 'Label', 'Metric', 'Inches', 'Imperial'];
                    if (hasFracs) headers.push('Simplified');
                    const rows: string[][] = [headers];
                    for (const group of cutListSummary) {
                      for (const c of group.items) {
                        const metric = `${c.lengthInput}${c.kind === 'sheet' && c.widthInput ? ` × ${c.widthInput}` : ''}`;
                        const inches = `${formatInchesOnly(c.length, imperialRes)}${c.kind === 'sheet' && c.width > 0 ? ` × ${formatInchesOnly(c.width, imperialRes)}` : ''}`;
                        const imperial = `${formatImperial(c.length, imperialRes)}${c.kind === 'sheet' && c.width > 0 ? ` × ${formatImperial(c.width, imperialRes)}` : ''}`;
                        const row = [group.nominal, String(c.quantity), c.label || '', metric, inches, imperial];
                        if (hasFracs) {
                          const frac = fractionInfo.get(c.id);
                          row.push(frac ? formatFraction(frac) : '');
                        }
                        rows.push(row);
                      }
                    }
                    navigator.clipboard.writeText(rows.map(r => r.join('\t')).join('\n'));
                  }}>
                    <Copy size={12} /> Copy
                  </Button>
                </Flex>
                <Box overflowX="auto">
                  {cutListSummary.map(group => (
                    <Box key={`${group.kind}::${group.nominal}`} mb={3}>
                      <Text fontSize="sm" fontWeight="bold" textTransform="uppercase" mb={1} px={2}>
                        {group.nominal} ({group.kind})
                      </Text>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <tbody>
                          {group.items.map(c => {
                            const frac = fractionInfo.get(c.id);
                            return (
                              <tr key={c.id}>
                                <td style={{ padding: '2px 8px', fontWeight: 700, width: 40 }}>{c.quantity}×</td>
                                <td style={{ padding: '2px 8px' }}>{c.label || '(unlabeled)'}</td>
                                <td style={{ padding: '2px 8px', color: '#a0aec0' }}>
                                  {c.lengthInput}{c.kind === 'sheet' && c.widthInput ? ` × ${c.widthInput}` : ''}
                                </td>
                                <td style={{ padding: '2px 8px', color: '#a0aec0' }}>
                                  {formatInchesOnly(c.length, imperialRes)}{c.kind === 'sheet' && c.width > 0 ? ` × ${formatInchesOnly(c.width, imperialRes)}` : ''}
                                </td>
                                <td style={{ padding: '2px 8px', color: '#a0aec0' }}>
                                  {formatImperial(c.length, imperialRes)}{c.kind === 'sheet' && c.width > 0 ? ` × ${formatImperial(c.width, imperialRes)}` : ''}
                                </td>
                                {fractionInfo.size > 0 && (
                                  <td style={{ padding: '2px 8px', color: '#38a169', fontWeight: 600 }}>
                                    {frac ? `→ ${formatFraction(frac)}` : ''}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </Box>
                  ))}
                </Box>
              </Box>
            </VStack>

            <VStack align="stretch" gap={6}>
              {solution.groups.map(g => (
                <Box key={g.nominal} borderWidth="1px" borderRadius="md" p={4}>
                  <Heading size="sm" mb={3} textTransform="uppercase">{g.nominal}</Heading>

                  {g.error && (
                    <Box p={3} borderRadius="md" bg={errorBg}>
                      <Text>{g.error}</Text>
                    </Box>
                  )}

                  {g.lumberResults && (
                    <>
                      <Flex gap={4} mb={3} wrap="wrap">
                        <Text fontSize="sm"><b>{g.lumberResults.length}</b> board(s)</Text>
                        <Text fontSize="sm">Cost: <b>${g.cost.toFixed(2)}</b></Text>
                        <Text fontSize="sm">
                          Waste: <b>{formatMm(g.lumberResults.reduce((s, u) => s + u.waste, 0))}</b>
                        </Text>
                      </Flex>
                      <Box overflowX="auto">
                        <LumberDiagram results={g.lumberResults} />
                      </Box>
                      {simplifyFractions && (
                        <VStack align="stretch" gap={1} mt={3}>
                          {g.lumberResults.map((used, i) => {
                            const recipe = computeBoardRecipe(used, fractionTolerance, kerf);
                            if (recipe.cuts.every(c => c.fraction === null)) return null;
                            return (
                              <Flex key={i} gap={2} align="baseline" wrap="wrap" px={2} py={1}
                                borderRadius="md" bg={recipe.allSimplified ? 'green.50' : undefined}
                                _dark={recipe.allSimplified ? { bg: 'green.900' } : undefined}>
                                <Text fontSize="sm" fontWeight="semibold" minW="120px">
                                  {used.stock.label} ({formatLength(used.stock.length)}):
                                </Text>
                                {recipe.cuts.map((c, j) => (
                                  <Text key={j} fontSize="sm">
                                    {c.label}{' '}
                                    {c.fraction
                                      ? <b style={{ color: 'var(--chakra-colors-green-600, #38a169)' }}>{c.fraction.n}/{c.fraction.d}</b>
                                      : <span style={{ color: 'var(--chakra-colors-gray-500, #a0aec0)' }}>{formatMm(c.originalLength)}</span>
                                    }
                                    {j < recipe.cuts.length - 1 ? ' + ' : ''}
                                  </Text>
                                ))}
                              </Flex>
                            );
                          })}
                        </VStack>
                      )}
                    </>
                  )}

                  {g.sheetResults && (
                    <>
                      <Flex gap={4} mb={3} wrap="wrap">
                        <Text fontSize="sm"><b>{g.sheetResults.length}</b> sheet(s)</Text>
                        <Text fontSize="sm">Cost: <b>${g.cost.toFixed(2)}</b></Text>
                        <Text fontSize="sm">
                          Utilization: <b>{(100 * (1 - g.sheetResults.reduce((s, u) => s + u.wasteArea, 0) /
                            g.sheetResults.reduce((s, u) => s + u.stock.length * u.stock.width, 0))).toFixed(1)}%</b>
                        </Text>
                      </Flex>
                      <Box overflowX="auto">
                        <SheetDiagram results={g.sheetResults} />
                      </Box>
                      {simplifyFractions && (
                        <VStack align="stretch" gap={1} mt={3}>
                          {g.sheetResults.map((used, i) => {
                            const recipe = computeSheetRecipe(used, fractionTolerance, kerf);
                            if (recipe.rects.every(r => r.fracW === null && r.fracH === null)) return null;
                            return (
                              <Flex key={i} gap={2} align="baseline" wrap="wrap" px={2} py={1}
                                borderRadius="md" bg={recipe.allSimplified ? 'green.50' : undefined}
                                _dark={recipe.allSimplified ? { bg: 'green.900' } : undefined}>
                                <Text fontSize="sm" fontWeight="semibold" minW="140px">
                                  Sheet {i + 1} ({formatLength(used.stock.length)} × {formatLength(used.stock.width)}):
                                </Text>
                                {recipe.rects.map((r, j) => (
                                  <Text key={j} fontSize="sm">
                                    {r.label}{' '}
                                    {r.fracW
                                      ? <b style={{ color: 'var(--chakra-colors-green-600, #38a169)' }}>{r.fracW.n}/{r.fracW.d}</b>
                                      : <span>{formatMm(r.originalW)}</span>
                                    }
                                    ×
                                    {r.fracH
                                      ? <b style={{ color: 'var(--chakra-colors-green-600, #38a169)' }}>{r.fracH.n}/{r.fracH.d}</b>
                                      : <span>{formatMm(r.originalH)}</span>
                                    }
                                    {j < recipe.rects.length - 1 ? ', ' : ''}
                                  </Text>
                                ))}
                              </Flex>
                            );
                          })}
                        </VStack>
                      )}
                    </>
                  )}
                </Box>
              ))}
            </VStack>
          </Box>
        )}
      </VStack>
    </Box>
  );
};

export default WoodPlanner;
