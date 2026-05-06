import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    Box,
    VStack,
    HStack,
    Text,
    Button,
    Input,
    Heading,
    IconButton,
    Flex,
    Spinner,
    Textarea,
} from '@chakra-ui/react';
import { recipeAPI } from '../../services/api';
import { jsonStore } from '../../services/jsonstore';

// ─── Icons ───────────────────────────────────────────────────────────────────

const RotateCWIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.55 5.55L11 1v3.07C7.06 4.56 4 7.92 4 12s3.05 7.44 7 7.93v-2.02c-2.84-.48-5-2.94-5-5.91s2.16-5.43 5-5.91V10l4.55-4.45zM19.93 11a7.9 7.9 0 00-1.62-3.89l-1.42 1.42c.54.75.88 1.6 1.02 2.47h2.02zM13 17.9v2.02c1.39-.17 2.74-.71 3.9-1.61l-1.44-1.44c-.75.54-1.59.89-2.46 1.03zm3.89-2.42l1.42 1.41A7.9 7.9 0 0019.93 13h-2.02a5.9 5.9 0 01-1.02 2.48z" />
    </svg>
);

const RotateCCWIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8.45 5.55L13 1v3.07c3.94.49 7 3.85 7 7.93s-3.05 7.44-7 7.93v-2.02c2.84-.48 5-2.94 5-5.91s-2.16-5.43-5-5.91V10L8.45 5.55zM4.07 11a7.9 7.9 0 011.62-3.89l1.42 1.42A5.9 5.9 0 006.09 11H4.07zM11 17.9v2.02a7.9 7.9 0 01-3.9-1.61l1.44-1.44c.75.54 1.59.89 2.46 1.03zm-3.89-2.42l-1.42 1.41A7.9 7.9 0 014.07 13h2.02c.14.87.48 1.72 1.02 2.48z" />
    </svg>
);

const CropIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17 15h2V7c0-1.1-.9-2-2-2H9v2h8v8zM7 17V1H5v4H1v2h4v10c0 1.1.9 2 2 2h10v4h2v-4h4v-2H7z" />
    </svg>
);

const StraightenIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21.71 3.29a1 1 0 00-1.42 0l-2.83 2.83-1.41-1.41-1.42 1.41 1.42 1.42-2.83 2.83-1.42-1.42-1.41 1.42 1.41 1.41-2.83 2.83-1.42-1.41-1.41 1.41 1.41 1.42-2.83 2.83a1 1 0 000 1.42 1 1 0 001.42 0l2.83-2.83 1.41 1.41 1.42-1.41-1.42-1.42 2.83-2.83 1.42 1.42 1.41-1.42-1.41-1.41 2.83-2.83 1.42 1.42 1.41-1.42-1.41-1.41 2.83-2.83a1 1 0 000-1.42z" />
    </svg>
);

const ScanIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm-1.5 9.5v3h-3v-3h3M11 13H5v6h6v-6zm6.5-6.5v3h-3v-3h3M19 5h-6v6h6V5zm-6 8h1.5v1.5H13V13zm1.5 1.5H16V16h-1.5v-1.5zM16 13h1.5v1.5H16V13zm-3 3h1.5v1.5H13V16zm1.5 1.5H16V19h-1.5v-1.5zM16 16h1.5v1.5H16V16zm1.5-1.5H19V16h-1.5v-1.5zm0 3H19V19h-1.5v-1.5zM22 7h-2V4h-3V2h5v5zm0 15v-5h-2v3h-3v2h5zM2 22h5v-2H4v-3H2v5zM2 2v5h2V4h3V2H2z" />
    </svg>
);

const CloseIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
);

const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
    </svg>
);

const UploadIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
    </svg>
);

// ─── Types ───────────────────────────────────────────────────────────────────

interface OCRLine {
    text: string;
    bbox: [number, number, number, number];
    confidence: number;
}

interface OCRResult {
    lines: OCRLine[];
    image_width: number;
    image_height: number;
}

export type ReceiptItemKind = 'item' | 'subtotal' | 'tax' | 'fee';

export interface ParsedReceiptItem {
    name: string;
    price: number;
    rawPriceText: string;
    dollarDetected: boolean;
    kind: ReceiptItemKind;
    detail?: string;
}

type LayoutMode = 'title-above' | 'details-below';

interface OCRProfile {
    name: string;
    priceColumnStart: number;
    rowMergeDistance: number;
    priceRegex: string;
    skipPatterns: string;
    summaryPatterns: string;
    layoutMode: LayoutMode;
    lang: string;
}

interface ReceiptScannerProps {
    onItemsParsed: (items: ParsedReceiptItem[]) => void;
    onClose: () => void;
}

const PROFILES_COLLECTION = 'ocr-profiles';
const PROFILES_KEY = 'saved';

const DEFAULT_PROFILE: OCRProfile = {
    name: 'Default',
    priceColumnStart: 0.60,
    rowMergeDistance: 0.025,
    priceRegex: '\\d+[.,]\\d{2}',
    skipPatterns: 'CASH,CARD,CHANGE,VISA,MASTERCARD,DEBIT,CREDIT,MERCI,THANK',
    summaryPatterns: 'TOTAL,SUBTOTAL,SUB TOTAL,SOUS-TOTAL,SOUS TOTAL,TAX,TPS,TVQ,GST,HST,QST,MONTANT,BALANCE',
    layoutMode: 'title-above',
    lang: 'en',
};

// ─── Post-processing utilities ───────────────────────────────────────────────

/** Clean up common OCR misreads in price-like text: $→strip, S→strip, l→1, O→0, etc. */
function normalizePrice(raw: string): string {
    return raw
        .replace(/^[$sSŠ]\s*/, '')
        .replace(/[oOøÖ]/g, '0')
        .replace(/[lIi|]/g, '1')
        .replace(/[Bb]/g, '8')
        .replace(/[Zz]/g, '2')
        .replace(/\s/g, '');
}

/** Like normalizePrice but treats a leading $-like char as a digit instead of stripping it. */
function normalizePriceKeepDollar(raw: string): string {
    return raw
        .replace(/^[$]/, '8')
        .replace(/^[sSŠ]/, '5')
        .replace(/[oOøÖ]/g, '0')
        .replace(/[lIi|]/g, '1')
        .replace(/[Bb]/g, '8')
        .replace(/[Zz]/g, '2')
        .replace(/\s/g, '');
}

function parseNumeric(s: string): number | null {
    const v = parseFloat(s.replace(/^[^0-9]*/, '').replace(',', '.'));
    return isNaN(v) ? null : v;
}

function tryParsePrice(text: string, priceRegex: RegExp): number | null {
    const directMatch = text.match(priceRegex);
    if (directMatch) {
        const v = parseNumeric(directMatch[0]);
        if (v !== null) return v;
    }
    const cleaned = normalizePrice(text);
    const fuzzyMatch = cleaned.match(priceRegex);
    if (fuzzyMatch) {
        const v = parseNumeric(fuzzyMatch[0]);
        if (v !== null) return v;
    }
    return null;
}

/** Re-parse a raw price text, choosing whether to treat the leading char as $ or as a digit. */
function reparsePrice(rawText: string, dollarIsReal: boolean, priceRegex: RegExp): number {
    const cleaned = dollarIsReal ? normalizePrice(rawText) : normalizePriceKeepDollar(rawText);
    const m = cleaned.match(priceRegex);
    if (m) {
        const v = parseNumeric(m[0]);
        if (v !== null) return v;
    }
    const v = parseFloat(cleaned.replace(',', '.'));
    return isNaN(v) ? 0 : v;
}

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface ExtractionResult {
    items: ParsedReceiptItem[];
    matchedLineIndices: Set<number>;
}

function classifySummaryKind(name: string): ReceiptItemKind {
    const u = name.toUpperCase();
    if (/\bTAX|TPS|TVQ|GST|HST|QST\b/.test(u)) return 'tax';
    if (/\bSUB\s*TOTAL|SOUS[\s-]*TOTAL\b/.test(u)) return 'subtotal';
    if (/\bTOTAL|MONTANT|BALANCE\b/.test(u)) return 'subtotal';
    return 'fee';
}

/**
 * Two-pass extraction:
 *
 * Pass 1 — Price-first: find all price boxes on the right, trace left for labels.
 *   Summary patterns (SUBTOTAL, TAX…) are kept but tagged with their kind.
 *   Skip patterns are excluded entirely.
 *
 * Pass 2 — Attach orphan lines to nearby items based on layoutMode:
 *   "title-above":   unmatched line above a price → detail for that item
 *   "details-below": unmatched line below a price → detail for that item
 */
function extractItems(
    lines: OCRLine[],
    priceColStart: number,
    priceRegex: RegExp,
    skipPatterns: string[],
    summaryPatterns: string[],
    rowMergeDistance: number,
    layoutMode: LayoutMode,
    maxHeightRatio: number = 2.0,
): ExtractionResult {
    if (lines.length === 0) return { items: [], matchedLineIndices: new Set() };

    const heights = lines.map(l => l.bbox[3] - l.bbox[1]);
    const medH = median(heights);

    const matchedIndices = new Set<number>();

    const prices: { lineIdx: number; line: OCRLine; value: number; rawText: string; hasDollar: boolean }[] = [];
    const labelIndices: number[] = [];

    for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        const midX = (line.bbox[0] + line.bbox[2]) / 2;
        const h = line.bbox[3] - line.bbox[1];
        const text = line.text.trim();

        if (medH > 0 && h > medH * maxHeightRatio) continue;

        if (midX >= priceColStart) {
            const value = tryParsePrice(text, priceRegex);
            if (value !== null && value > 0) {
                const hasDollar = /^\$/.test(text) || /\$$/.test(text);
                prices.push({ lineIdx: idx, line, value, rawText: text, hasDollar });
                matchedIndices.add(idx);
                continue;
            }
        }
        labelIndices.push(idx);
    }

    // Pass 1: match labels to prices
    const usedLabelIndices = new Set<number>();
    const items: ParsedReceiptItem[] = [];
    const itemPriceYs: { midY: number }[] = [];

    for (const { lineIdx: priceIdx, line: priceLine, value, rawText, hasDollar } of prices) {
        const priceMidY = (priceLine.bbox[1] + priceLine.bbox[3]) / 2;

        const matching = labelIndices
            .filter(idx => {
                if (usedLabelIndices.has(idx)) return false;
                const l = lines[idx];
                const lMidY = (l.bbox[1] + l.bbox[3]) / 2;
                return Math.abs(lMidY - priceMidY) <= rowMergeDistance
                    && l.bbox[0] < priceLine.bbox[0];
            })
            .sort((a, b) => lines[a].bbox[0] - lines[b].bbox[0]);

        const name = matching.map(idx => lines[idx].text.trim()).join(' ').trim();
        if (!name) continue;

        const upper = name.toUpperCase();
        const skip = skipPatterns.some(p => upper.includes(p.trim().toUpperCase()));
        if (skip) continue;

        matching.forEach(idx => { usedLabelIndices.add(idx); matchedIndices.add(idx); });
        matchedIndices.add(priceIdx);

        const isSummary = summaryPatterns.some(p => upper.includes(p.trim().toUpperCase()));
        const kind: ReceiptItemKind = isSummary ? classifySummaryKind(name) : 'item';

        items.push({ name, price: value, rawPriceText: rawText, dollarDetected: hasDollar, kind });
        itemPriceYs.push({ midY: priceMidY });
    }

    // Pass 2: attach unmatched non-price lines to nearby items.
    //
    // "title-above":   orphan lines ABOVE a price → prepend to item name
    //                  (the article title sits above the price row)
    // "details-below": orphan lines BELOW a price → append as detail
    //                  (extra info like weight/SKU sits below the price row)

    for (const idx of labelIndices) {
        if (usedLabelIndices.has(idx)) continue;
        const line = lines[idx];
        const lineMidY = (line.bbox[1] + line.bbox[3]) / 2;
        const text = line.text.trim();
        if (!text) continue;

        let bestItemIdx = -1;
        let bestDist = Infinity;

        for (let i = 0; i < items.length; i++) {
            const pInfo = itemPriceYs[i];
            if (!pInfo) continue;
            if (items[i].kind !== 'item') continue;

            const dist = lineMidY - pInfo.midY; // positive = line is below price
            const absDist = Math.abs(dist);

            if (absDist > rowMergeDistance * 3) continue;

            if (layoutMode === 'title-above') {
                // Orphan line must be ABOVE the price row (dist < 0)
                if (dist < 0 && absDist < bestDist) {
                    bestDist = absDist;
                    bestItemIdx = i;
                }
            } else {
                // Orphan line must be BELOW the price row (dist > 0)
                if (dist > 0 && absDist < bestDist) {
                    bestDist = absDist;
                    bestItemIdx = i;
                }
            }
        }

        if (bestItemIdx >= 0) {
            const item = items[bestItemIdx];
            if (layoutMode === 'title-above') {
                item.name = item.name ? `${text} ${item.name}` : text;
            } else {
                item.name = item.name ? `${item.name} ${text}` : text;
            }
            matchedIndices.add(idx);
        }
    }

    return { items, matchedLineIndices: matchedIndices };
}

// ─── Component ───────────────────────────────────────────────────────────────

const ReceiptScanner: React.FC<ReceiptScannerProps> = ({ onItemsParsed, onClose }) => {
    // Image state
    const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
    const [rotation, setRotation] = useState(0);
    const [freeRotation, setFreeRotation] = useState(0);
    const [threshold, setThreshold] = useState(0);
    const [cropping, setCropping] = useState(false);
    const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const [straightening, setStraightening] = useState(false);
    const [straightenLine, setStraightenLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

    // OCR state
    const [scanning, setScanning] = useState(false);
    const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
    const [parsedItems, setParsedItems] = useState<ParsedReceiptItem[]>([]);
    const [matchedLineIndices, setMatchedLineIndices] = useState<Set<number>>(new Set());

    // Profile / dials
    const [profiles, setProfiles] = useState<OCRProfile[]>([DEFAULT_PROFILE]);
    const [profileName, setProfileName] = useState(DEFAULT_PROFILE.name);
    const [priceColumnStart, setPriceColumnStart] = useState(DEFAULT_PROFILE.priceColumnStart);
    const [rowMergeDistance, setRowMergeDistance] = useState(DEFAULT_PROFILE.rowMergeDistance);
    const [priceRegex, setPriceRegex] = useState(DEFAULT_PROFILE.priceRegex);
    const [skipPatterns, setSkipPatterns] = useState(DEFAULT_PROFILE.skipPatterns);
    const [summaryPatterns, setSummaryPatterns] = useState(DEFAULT_PROFILE.summaryPatterns);
    const [layoutMode, setLayoutMode] = useState<LayoutMode>(DEFAULT_PROFILE.layoutMode);
    const [lang, setLang] = useState(DEFAULT_PROFILE.lang);

    // Refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const dragStart = useRef<{ x: number; y: number } | null>(null);
    const [canvasHeight, setCanvasHeight] = useState<number | null>(null);

    // ─── Profile persistence ─────────────────────────────────────────

    useEffect(() => {
        jsonStore.get<OCRProfile[]>(PROFILES_COLLECTION, PROFILES_KEY)
            .then(saved => {
                if (saved && saved.length > 0) setProfiles(saved);
            })
            .catch(() => { /* first run, no profiles yet */ });
    }, []);

    const persistProfiles = useCallback(async (next: OCRProfile[]) => {
        setProfiles(next);
        try { await jsonStore.put(PROFILES_COLLECTION, PROFILES_KEY, next); } catch { /* ignore */ }
    }, []);

    const handleProfileNameChange = useCallback((name: string) => {
        setProfileName(name);
        const match = profiles.find(p => p.name === name);
        if (match) {
            setPriceColumnStart(match.priceColumnStart);
            setRowMergeDistance(match.rowMergeDistance);
            setPriceRegex(match.priceRegex);
            setSkipPatterns(match.skipPatterns);
            setSummaryPatterns(match.summaryPatterns ?? DEFAULT_PROFILE.summaryPatterns);
            setLayoutMode(match.layoutMode ?? DEFAULT_PROFILE.layoutMode);
            setLang(match.lang);
        }
    }, [profiles]);

    const handleSaveProfile = useCallback(() => {
        const name = profileName.trim() || `Profile ${profiles.length + 1}`;
        const p: OCRProfile = { name, priceColumnStart, rowMergeDistance, priceRegex, skipPatterns, summaryPatterns, layoutMode, lang };
        const idx = profiles.findIndex(x => x.name === name);
        const next = idx >= 0
            ? profiles.map((x, i) => i === idx ? p : x)
            : [...profiles, p];
        persistProfiles(next);
        setProfileName(name);
    }, [profileName, profiles, priceColumnStart, rowMergeDistance, priceRegex, skipPatterns, summaryPatterns, layoutMode, lang, persistProfiles]);

    const handleDeleteProfile = useCallback(() => {
        const idx = profiles.findIndex(p => p.name === profileName);
        if (idx < 0 || profiles.length <= 1) return;
        const next = profiles.filter((_, i) => i !== idx);
        persistProfiles(next);
        const fallback = next[0];
        setProfileName(fallback.name);
        setPriceColumnStart(fallback.priceColumnStart);
        setRowMergeDistance(fallback.rowMergeDistance);
        setPriceRegex(fallback.priceRegex);
        setSkipPatterns(fallback.skipPatterns);
        setSummaryPatterns(fallback.summaryPatterns ?? DEFAULT_PROFILE.summaryPatterns);
        setLayoutMode(fallback.layoutMode ?? DEFAULT_PROFILE.layoutMode);
        setLang(fallback.lang);
    }, [profiles, profileName, persistProfiles]);

    // ─── Canvas drawing ──────────────────────────────────────────────

    const drawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const img = sourceImage;
        if (!canvas || !img) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const srcW = img.width;
        const srcH = img.height;
        const totalRot = rotation + freeRotation;
        const rad = (totalRot * Math.PI) / 180;
        const absCos = Math.abs(Math.cos(rad));
        const absSin = Math.abs(Math.sin(rad));

        const dstW = srcW * absCos + srcH * absSin;
        const dstH = srcW * absSin + srcH * absCos;

        const scale = Math.min(1, 800 / dstW);
        canvas.width = Math.round(dstW * scale);
        canvas.height = Math.round(dstH * scale);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);
        ctx.drawImage(
            img,
            0, 0, srcW, srcH,
            -srcW * scale / 2, -srcH * scale / 2, srcW * scale, srcH * scale,
        );
        ctx.restore();

        // Apply binary threshold for OCR enhancement
        if (threshold > 0) {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const d = imageData.data;
            for (let i = 0; i < d.length; i += 4) {
                const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                const val = gray >= threshold ? 255 : 0;
                d[i] = val;
                d[i + 1] = val;
                d[i + 2] = val;
            }
            ctx.putImageData(imageData, 0, 0);
        }

        // Track canvas rendered height for the items panel
        requestAnimationFrame(() => {
            if (canvasContainerRef.current) {
                setCanvasHeight(canvasContainerRef.current.clientHeight);
            }
        });
    }, [sourceImage, rotation, freeRotation, threshold]);

    useEffect(() => { drawCanvas(); }, [drawCanvas]);

    // ─── Overlay (bbox + crop rect) ─────────────────────────────────

    const drawOverlay = useCallback(() => {
        const overlay = overlayCanvasRef.current;
        const main = canvasRef.current;
        if (!overlay || !main) return;
        const ctx = overlay.getContext('2d');
        if (!ctx) return;

        overlay.width = main.width;
        overlay.height = main.height;
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        // Draw OCR bounding boxes
        if (ocrResult && !cropping) {
            let rx: RegExp;
            try { rx = new RegExp(priceRegex); } catch { rx = /\d+[.,]\d{2}/; }

            const allHeights = ocrResult.lines.map(l => l.bbox[3] - l.bbox[1]);
            const medH = median(allHeights);

            for (let lineIdx = 0; lineIdx < ocrResult.lines.length; lineIdx++) {
                const line = ocrResult.lines[lineIdx];
                const [x1, y1, x2, y2] = line.bbox;
                const bx = x1 * overlay.width;
                const by = y1 * overlay.height;
                const bw = (x2 - x1) * overlay.width;
                const bh = (y2 - y1) * overlay.height;

                const h = y2 - y1;
                const oversized = medH > 0 && h > medH * 2;
                const midX = (x1 + x2) / 2;
                const isPrice = midX >= priceColumnStart && tryParsePrice(line.text.trim(), rx) !== null;
                const isMatched = matchedLineIndices.has(lineIdx);

                if (oversized) {
                    ctx.strokeStyle = 'rgba(160,160,160,0.5)';
                    ctx.fillStyle = 'rgba(160,160,160,0.1)';
                    ctx.setLineDash([4, 3]);
                } else if (isPrice) {
                    ctx.strokeStyle = 'rgba(34,197,94,0.8)';
                    ctx.fillStyle = 'rgba(34,197,94,0.15)';
                    ctx.setLineDash([]);
                } else if (!isMatched) {
                    // Unmatched line — distinct color (amber/yellow)
                    ctx.strokeStyle = 'rgba(245,158,11,0.8)';
                    ctx.fillStyle = 'rgba(245,158,11,0.15)';
                    ctx.setLineDash([3, 2]);
                } else {
                    ctx.strokeStyle = 'rgba(59,130,246,0.7)';
                    ctx.fillStyle = 'rgba(59,130,246,0.1)';
                    ctx.setLineDash([]);
                }

                ctx.lineWidth = 2;
                ctx.strokeRect(bx, by, bw, bh);
                ctx.fillRect(bx, by, bw, bh);
                ctx.setLineDash([]);

                // Draw horizontal trace line from price to its label
                if (isPrice && !oversized) {
                    const priceMidY = (y1 + y2) / 2;
                    ctx.setLineDash([3, 3]);
                    ctx.strokeStyle = 'rgba(34,197,94,0.4)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(bx, priceMidY * overlay.height);
                    ctx.lineTo(0, priceMidY * overlay.height);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }

            // Price column threshold line
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = 'rgba(234,88,12,0.7)';
            ctx.lineWidth = 1;
            const px = priceColumnStart * overlay.width;
            ctx.beginPath();
            ctx.moveTo(px, 0);
            ctx.lineTo(px, overlay.height);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw crop rectangle
        if (cropping && cropRect) {
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(0, 0, overlay.width, overlay.height);

            const rx = cropRect.x;
            const ry = cropRect.y;
            const rw = cropRect.w;
            const rh = cropRect.h;
            ctx.clearRect(rx, ry, rw, rh);

            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(rx, ry, rw, rh);
        }

        // Draw straighten guide line
        if (straightening && straightenLine) {
            const { x1, y1, x2, y2 } = straightenLine;

            ctx.strokeStyle = 'rgba(234,88,12,0.9)';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            // Endpoint dots
            for (const [px, py] of [[x1, y1], [x2, y2]]) {
                ctx.fillStyle = 'rgba(234,88,12,1)';
                ctx.beginPath();
                ctx.arc(px, py, 4, 0, Math.PI * 2);
                ctx.fill();
            }

            // Show the detected angle
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 20) {
                const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
                const isMoreHorizontal = Math.abs(dx) >= Math.abs(dy);
                const correction = isMoreHorizontal ? -angleDeg : -(angleDeg - 90);
                const direction = isMoreHorizontal ? 'H' : 'V';

                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;
                const label = `${correction > 0 ? '+' : ''}${correction.toFixed(1)}° → ${direction}`;
                const metrics = ctx.measureText(label);
                ctx.fillRect(midX - metrics.width / 2 - 4, midY - 20, metrics.width + 8, 18);
                ctx.fillStyle = '#fff';
                ctx.font = '12px sans-serif';
                ctx.fillText(label, midX - metrics.width / 2, midY - 7);
            }
        }
    }, [ocrResult, cropping, cropRect, straightening, straightenLine, priceColumnStart, priceRegex, matchedLineIndices]);

    useEffect(() => { drawOverlay(); }, [drawOverlay]);

    // ─── Re-run post-processing when dials change ────────────────────

    useEffect(() => {
        if (!ocrResult) { setMatchedLineIndices(new Set()); return; }
        let rx: RegExp;
        try { rx = new RegExp(priceRegex); } catch { rx = /\d+[.,]\d{2}/; }
        const skip = skipPatterns.split(',').map(s => s.trim()).filter(Boolean);
        const summary = summaryPatterns.split(',').map(s => s.trim()).filter(Boolean);
        const result = extractItems(ocrResult.lines, priceColumnStart, rx, skip, summary, rowMergeDistance, layoutMode);
        setParsedItems(result.items);
        setMatchedLineIndices(result.matchedLineIndices);
    }, [ocrResult, priceColumnStart, rowMergeDistance, priceRegex, skipPatterns, summaryPatterns, layoutMode]);

    // ─── Handlers ────────────────────────────────────────────────────

    const resetImageState = useCallback((img: HTMLImageElement) => {
        setSourceImage(img);
        setRotation(0);
        setFreeRotation(0);
        setThreshold(0);
        setOcrResult(null);
        setParsedItems([]);
    }, []);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const img = new Image();
        img.onload = () => resetImageState(img);
        img.src = URL.createObjectURL(file);
        e.target.value = '';
    }, [resetImageState]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) return;
        const img = new Image();
        img.onload = () => resetImageState(img);
        img.src = URL.createObjectURL(file);
    }, [resetImageState]);

    const handleRotate = useCallback((deg: number) => {
        setRotation(r => r + deg);
        setOcrResult(null);
        setParsedItems([]);
    }, []);

    // Convert mouse event CSS coords → canvas pixel coords
    const toCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const overlay = overlayCanvasRef.current!;
        const rect = overlay.getBoundingClientRect();
        const scaleX = overlay.width / rect.width;
        const scaleY = overlay.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }, []);

    // Unified overlay mouse handlers for crop & straighten
    const handleOverlayMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const pt = toCanvasCoords(e);
        dragStart.current = pt;
        if (cropping) {
            setCropRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
        } else if (straightening) {
            setStraightenLine({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
        }
    }, [cropping, straightening, toCanvasCoords]);

    const handleOverlayMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!dragStart.current) return;
        const pt = toCanvasCoords(e);
        if (cropping) {
            const sx = Math.min(dragStart.current.x, pt.x);
            const sy = Math.min(dragStart.current.y, pt.y);
            const sw = Math.abs(pt.x - dragStart.current.x);
            const sh = Math.abs(pt.y - dragStart.current.y);
            setCropRect({ x: sx, y: sy, w: sw, h: sh });
        } else if (straightening) {
            setStraightenLine(prev => prev ? { ...prev, x2: pt.x, y2: pt.y } : null);
        }
    }, [cropping, straightening, toCanvasCoords]);

    const handleOverlayMouseUp = useCallback(() => {
        dragStart.current = null;
    }, []);

    const applyCrop = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !cropRect || cropRect.w < 10 || cropRect.h < 10) return;

        // Extract the cropped region directly from the rendered canvas
        // (which already includes rotation). This avoids any reverse-transform.
        const tmp = document.createElement('canvas');
        tmp.width = Math.round(cropRect.w);
        tmp.height = Math.round(cropRect.h);
        const tmpCtx = tmp.getContext('2d');
        if (!tmpCtx) return;
        tmpCtx.drawImage(
            canvas,
            cropRect.x, cropRect.y, cropRect.w, cropRect.h,
            0, 0, tmp.width, tmp.height,
        );

        const img = new Image();
        img.onload = () => resetImageState(img);
        img.src = tmp.toDataURL('image/png');

        setCropping(false);
        setCropRect(null);
    }, [cropRect, resetImageState]);

    const cancelCrop = useCallback(() => {
        setCropping(false);
        setCropRect(null);
        dragStart.current = null;
    }, []);

    const applyStraighten = useCallback(() => {
        if (!straightenLine) return;
        const { x1, y1, x2, y2 } = straightenLine;
        const dx = x2 - x1;
        const dy = y2 - y1;
        if (Math.sqrt(dx * dx + dy * dy) < 20) return;

        const angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
        const isMoreHorizontal = Math.abs(dx) >= Math.abs(dy);
        const correction = isMoreHorizontal ? -angleDeg : -(angleDeg - 90);

        setFreeRotation(r => r + correction);
        setStraightening(false);
        setStraightenLine(null);
        setOcrResult(null);
        setParsedItems([]);
    }, [straightenLine]);

    const cancelStraighten = useCallback(() => {
        setStraightening(false);
        setStraightenLine(null);
        dragStart.current = null;
    }, []);

    const handleScan = useCallback(async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        setScanning(true);
        try {
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))), 'image/png');
            });
            const result = await recipeAPI.scanReceipt(blob, lang);
            setOcrResult(result);
        } catch (err) {
            console.error('OCR scan failed:', err);
        } finally {
            setScanning(false);
        }
    }, [lang]);

    const handleConfirm = useCallback(() => {
        onItemsParsed(parsedItems);
        onClose();
    }, [parsedItems, onItemsParsed, onClose]);

    // ─── Render ──────────────────────────────────────────────────────

    const selectStyle: React.CSSProperties = {
        width: '100%', padding: '6px',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        backgroundColor: 'var(--input-bg)',
        color: 'var(--heading-color)',
        fontSize: '14px',
    };

    return (
        <Box
            position="fixed" top={0} left={0} right={0} bottom={0}
            bg="blackAlpha.700" zIndex={1000}
            display="flex" alignItems="center" justifyContent="center" p={4}
        >
            <Box
                borderRadius="lg" maxW="1400px" width="100%" maxH="95vh" overflowY="auto" p={6}
                style={{ background: 'var(--card-bg)' }}
            >
                <Flex justify="space-between" align="center" mb={4}>
                    <Heading size="md" style={{ color: 'var(--heading-color)' }}>Receipt Scanner</Heading>
                    <IconButton aria-label="Close" onClick={onClose} variant="ghost" size="sm">
                        <CloseIcon />
                    </IconButton>
                </Flex>

                {/* Upload area (shown when no image) */}
                {!sourceImage && (
                    <Box
                        border="2px dashed" borderRadius="md" p={8} textAlign="center" cursor="pointer"
                        style={{ borderColor: 'var(--border-color)' }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        _hover={{ opacity: 0.8 }}
                    >
                        <input
                            type="file" ref={fileInputRef} onChange={handleFileSelect}
                            accept="image/*" style={{ display: 'none' }}
                        />
                        <VStack gap={2}>
                            <UploadIcon />
                            <Text style={{ color: 'var(--muted-text)' }}>
                                Drop a receipt image here or <Text as="span" style={{ color: 'var(--panel-blue-text)' }} fontWeight="medium">browse</Text>
                            </Text>
                            <Text fontSize="xs" style={{ color: 'var(--empty-text)' }}>PNG, JPG, JPEG, WEBP</Text>
                        </VStack>
                    </Box>
                )}

                {/* Main content when image is loaded */}
                {sourceImage && (
                    <VStack align="stretch" gap={4}>
                        {/* Toolbar */}
                        <HStack gap={2} flexWrap="wrap">
                            <Button size="sm" variant="outline" onClick={() => handleRotate(-90)}>
                                <RotateCCWIcon /> <Text ml={1}>-90</Text>
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleRotate(90)}>
                                <RotateCWIcon /> <Text ml={1}>+90</Text>
                            </Button>

                            <HStack gap={1} align="center" px={1}>
                                <Text fontSize="xs" style={{ color: 'var(--empty-text)' }} whiteSpace="nowrap">{freeRotation.toFixed(1)}°</Text>
                                <input
                                    type="range" min={-10} max={10} step={0.5}
                                    value={freeRotation}
                                    onChange={e => { setFreeRotation(parseFloat(e.target.value)); setOcrResult(null); setParsedItems([]); }}
                                    style={{ width: '80px' }}
                                    title="Fine rotation"
                                />
                                {freeRotation !== 0 && (
                                    <Button size="xs" variant="ghost" onClick={() => { setFreeRotation(0); setOcrResult(null); setParsedItems([]); }} p={0} minW="auto" h="20px">
                                        <CloseIcon />
                                    </Button>
                                )}
                            </HStack>

                            {!cropping && !straightening && (
                                <>
                                    <Button size="sm" variant="outline" onClick={() => setCropping(true)}>
                                        <CropIcon /> <Text ml={1}>Crop</Text>
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setStraightening(true)}>
                                        <StraightenIcon /> <Text ml={1}>Straighten</Text>
                                    </Button>
                                </>
                            )}
                            {cropping && (
                                <>
                                    <Button size="sm" colorScheme="green" onClick={applyCrop} disabled={!cropRect || cropRect.w < 10}>
                                        <CheckIcon /> <Text ml={1}>Apply Crop</Text>
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={cancelCrop}>Cancel</Button>
                                </>
                            )}
                            {straightening && (
                                <>
                                    <Text fontSize="xs" style={{ color: 'var(--empty-text)' }} alignSelf="center">Draw a line along a straight edge</Text>
                                    <Button size="sm" colorScheme="green" onClick={applyStraighten} disabled={!straightenLine}>
                                        <CheckIcon /> <Text ml={1}>Apply</Text>
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={cancelStraighten}>Cancel</Button>
                                </>
                            )}

                            <Box flex={1} />

                            <Button
                                size="sm" colorScheme="blue" onClick={handleScan}
                                disabled={scanning || cropping || straightening}
                            >
                                {scanning ? <Spinner size="sm" /> : <ScanIcon />}
                                <Text ml={1}>{scanning ? 'Scanning...' : 'Scan'}</Text>
                            </Button>

                            <Button size="sm" variant="ghost" onClick={() => { setSourceImage(null); setOcrResult(null); setParsedItems([]); }}>
                                New Image
                            </Button>
                        </HStack>

                        {/* Image + Detected Items side by side */}
                        <Flex gap={4} direction={{ base: 'column', lg: 'row' }} align="flex-start">
                            {/* Canvas */}
                            <Box
                                ref={canvasContainerRef}
                                position="relative" borderRadius="md" overflow="hidden" flexShrink={0}
                                style={{ border: '1px solid var(--border-color)', background: '#1a202c' }}
                            >
                                <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%' }} />
                                <canvas
                                    ref={overlayCanvasRef}
                                    style={{ position: 'absolute', top: 0, left: 0, maxWidth: '100%', cursor: (cropping || straightening) ? 'crosshair' : 'default' }}
                                    onMouseDown={handleOverlayMouseDown}
                                    onMouseMove={handleOverlayMouseMove}
                                    onMouseUp={handleOverlayMouseUp}
                                />
                            </Box>

                            {/* Detected Items — side by side with image */}
                            {parsedItems.length > 0 && (() => {
                                const afterCaret = priceRegex.replace(/^\^/, '');
                                const regexHasDollarStart = afterCaret.startsWith('\\$') || afterCaret.startsWith('$');
                                const regexHasDollarEnd = priceRegex.length >= 2 && priceRegex.slice(-2) === '\\$';
                                const showDollarToggle = regexHasDollarStart || regexHasDollarEnd;
                                const itemListMaxH = canvasHeight ? `${canvasHeight - 48}px` : '500px';

                                const regularItems = parsedItems.filter(it => it.kind === 'item');
                                const summaryItems = parsedItems.filter(it => it.kind !== 'item');

                                const kindLabel: Record<ReceiptItemKind, string> = {
                                    item: '', subtotal: 'Sub', tax: 'Tax', fee: 'Fee',
                                };
                                const kindColor: Record<ReceiptItemKind, string> = {
                                    item: 'var(--panel-green-text)',
                                    subtotal: 'var(--panel-orange-heading)',
                                    tax: 'var(--muted-text)',
                                    fee: 'var(--muted-text)',
                                };

                                const renderRow = (item: ParsedReceiptItem, i: number) => (
                                    <Box key={i}>
                                        <Flex
                                            gap={2} align="center" fontSize="sm" px={2} py={1} borderRadius="sm"
                                            style={{
                                                background: item.kind === 'item' ? 'var(--card-bg-raised)' : 'transparent',
                                                opacity: item.kind === 'item' ? 1 : 0.8,
                                            }}
                                        >
                                            {item.kind !== 'item' && (
                                                <Text fontSize="2xs" fontWeight="bold" px={1}
                                                    style={{ color: kindColor[item.kind], minWidth: '28px', textAlign: 'center' }}
                                                >{kindLabel[item.kind]}</Text>
                                            )}
                                            <Input
                                                size="sm" flex={1}
                                                value={item.name}
                                                onChange={e => {
                                                    const next = [...parsedItems];
                                                    const realIdx = parsedItems.indexOf(item);
                                                    next[realIdx] = { ...next[realIdx], name: e.target.value };
                                                    setParsedItems(next);
                                                }}
                                                style={{
                                                    color: item.kind === 'item' ? 'var(--heading-color)' : kindColor[item.kind],
                                                    fontStyle: item.kind !== 'item' ? 'italic' : undefined,
                                                }}
                                            />
                                            {showDollarToggle && regexHasDollarStart && (
                                                <Button
                                                    size="xs" variant={item.dollarDetected ? 'solid' : 'outline'}
                                                    colorScheme={item.dollarDetected ? 'green' : 'gray'}
                                                    px={1} minW="26px" h="26px" fontWeight="bold" fontSize="sm"
                                                    title={item.dollarDetected
                                                        ? 'First digit stripped as $ — click to restore'
                                                        : 'Click to strip first digit as $'}
                                                    onClick={() => {
                                                        const next = [...parsedItems];
                                                        const realIdx = parsedItems.indexOf(item);
                                                        const newDollar = !item.dollarDetected;
                                                        let newPrice: number;
                                                        if (newDollar) {
                                                            newPrice = parseFloat(String(item.price).slice(1)) || 0;
                                                        } else {
                                                            const digits = item.rawPriceText.replace(/[^0-9.,]/g, '').replace(',', '.');
                                                            newPrice = parseFloat(digits) || 0;
                                                        }
                                                        next[realIdx] = { ...next[realIdx], dollarDetected: newDollar, price: newPrice };
                                                        setParsedItems(next);
                                                    }}
                                                >$</Button>
                                            )}
                                            <Input
                                                size="sm" w="80px" textAlign="right" type="number" step="0.01" min="0"
                                                value={item.price}
                                                onChange={e => {
                                                    const next = [...parsedItems];
                                                    const realIdx = parsedItems.indexOf(item);
                                                    next[realIdx] = { ...next[realIdx], price: parseFloat(e.target.value) || 0 };
                                                    setParsedItems(next);
                                                }}
                                                style={{ color: kindColor[item.kind] || 'var(--panel-green-text)', fontWeight: 600 }}
                                            />
                                            {showDollarToggle && regexHasDollarEnd && (
                                                <Button
                                                    size="xs" variant={item.dollarDetected ? 'solid' : 'outline'}
                                                    colorScheme={item.dollarDetected ? 'green' : 'gray'}
                                                    px={1} minW="26px" h="26px" fontWeight="bold" fontSize="sm"
                                                    title={item.dollarDetected
                                                        ? 'Last digit stripped as $ — click to restore'
                                                        : 'Click to strip last digit as $'}
                                                    onClick={() => {
                                                        const next = [...parsedItems];
                                                        const realIdx = parsedItems.indexOf(item);
                                                        const newDollar = !item.dollarDetected;
                                                        let newPrice: number;
                                                        if (newDollar) {
                                                            newPrice = parseFloat(String(item.price).slice(0, -1)) || 0;
                                                        } else {
                                                            const digits = item.rawPriceText.replace(/[^0-9.,]/g, '').replace(',', '.');
                                                            newPrice = parseFloat(digits) || 0;
                                                        }
                                                        next[realIdx] = { ...next[realIdx], dollarDetected: newDollar, price: newPrice };
                                                        setParsedItems(next);
                                                    }}
                                                >$</Button>
                                            )}
                                            <IconButton
                                                aria-label="Remove item" size="xs" variant="ghost"
                                                onClick={() => {
                                                    const realIdx = parsedItems.indexOf(item);
                                                    setParsedItems(parsedItems.filter((_, j) => j !== realIdx));
                                                }}
                                            >
                                                <CloseIcon />
                                            </IconButton>
                                        </Flex>
                                        {item.detail && (
                                            <Text fontSize="xs" px={3} pb={1} style={{ color: 'var(--muted-text)', fontStyle: 'italic' }}>
                                                {item.detail}
                                            </Text>
                                        )}
                                    </Box>
                                );

                                return (
                                    <Box
                                        p={4} borderRadius="md" flex={1} minW="280px"
                                        style={{
                                            border: '1px solid var(--panel-green-border)',
                                            background: 'var(--panel-green-bg)',
                                            maxHeight: canvasHeight ? `${canvasHeight}px` : undefined,
                                            display: 'flex', flexDirection: 'column',
                                        }}
                                    >
                                        <Flex justify="space-between" align="center" mb={2} flexShrink={0}>
                                            <Text fontSize="sm" fontWeight="semibold" style={{ color: 'var(--panel-green-heading)' }}>
                                                Items ({regularItems.length})
                                                {summaryItems.length > 0 && (
                                                    <span style={{ fontWeight: 400, color: 'var(--muted-text)' }}>
                                                        {' '}+ {summaryItems.length} summary
                                                    </span>
                                                )}
                                            </Text>
                                            <Button size="sm" colorScheme="green" onClick={handleConfirm}>
                                                <CheckIcon /> <Text ml={1}>Import</Text>
                                            </Button>
                                        </Flex>
                                        <VStack gap={1} align="stretch" overflowY="auto" style={{ maxHeight: itemListMaxH }}>
                                            {regularItems.map((item, i) => renderRow(item, i))}
                                            {summaryItems.length > 0 && (
                                                <>
                                                    <Box my={1} style={{ borderTop: '1px dashed var(--border-color)' }} />
                                                    {summaryItems.map((item, i) => renderRow(item, regularItems.length + i))}
                                                </>
                                            )}
                                        </VStack>
                                    </Box>
                                );
                            })()}

                            {ocrResult && parsedItems.length === 0 && (
                                <Box
                                    p={4} borderRadius="md" flex={1} minW="240px"
                                    style={{
                                        border: '1px solid var(--panel-orange-border)',
                                        background: 'var(--panel-orange-bg)',
                                    }}
                                >
                                    <Text fontSize="sm" style={{ color: 'var(--panel-orange-heading)' }}>
                                        No items detected. Try adjusting the price column threshold or row merge distance.
                                    </Text>
                                    {ocrResult.lines.length > 0 && (
                                        <Text fontSize="xs" style={{ color: 'var(--panel-orange-text)' }} mt={1}>
                                            OCR found {ocrResult.lines.length} text region(s) — check the bounding boxes on the image.
                                        </Text>
                                    )}
                                </Box>
                            )}
                        </Flex>

                        {/* Controls row below */}
                        <Flex gap={4} direction={{ base: 'column', md: 'row' }}>
                            {/* Profile selector */}
                            <Box
                                p={4} borderRadius="md" flex={1}
                                style={{ border: '1px solid var(--border-color)', background: 'var(--card-bg-raised)' }}
                            >
                                <Text fontSize="sm" fontWeight="semibold" mb={2} style={{ color: 'var(--heading-color)' }}>Shop Profile</Text>
                                <HStack gap={2}>
                                    <Box flex={1}>
                                        <Input
                                            size="sm"
                                            placeholder="Profile name"
                                            value={profileName}
                                            onChange={e => handleProfileNameChange(e.target.value)}
                                            list="ocr-profile-list"
                                        />
                                        <datalist id="ocr-profile-list">
                                            {profiles.map((p, i) => (
                                                <option key={i} value={p.name} />
                                            ))}
                                        </datalist>
                                    </Box>
                                    <Button size="sm" colorScheme="blue" variant="outline" onClick={handleSaveProfile}>Save</Button>
                                    {profiles.some(p => p.name === profileName) && profiles.length > 1 && (
                                        <Button size="sm" colorScheme="red" variant="ghost" onClick={handleDeleteProfile}>Del</Button>
                                    )}
                                </HStack>
                            </Box>

                            {/* Dials */}
                            <Box
                                p={4} borderRadius="md" flex={2}
                                style={{ border: '1px solid var(--border-color)', background: 'var(--card-bg-raised)' }}
                            >
                                <Text fontSize="sm" fontWeight="semibold" mb={3} style={{ color: 'var(--heading-color)' }}>Processing Controls</Text>
                                <Flex gap={4} direction={{ base: 'column', md: 'row' }}>
                                    <VStack gap={3} align="stretch" flex={1}>
                                        <Box>
                                            <Flex justify="space-between">
                                                <Text fontSize="xs" style={{ color: 'var(--muted-text)' }}>Threshold (B&W)</Text>
                                                <Text fontSize="xs" style={{ color: 'var(--empty-text)' }}>{threshold === 0 ? 'Off' : threshold}</Text>
                                            </Flex>
                                            <input
                                                type="range" min={0} max={255} step={1}
                                                value={threshold}
                                                onChange={e => setThreshold(parseInt(e.target.value))}
                                                style={{ width: '100%' }}
                                            />
                                        </Box>

                                        <Box>
                                            <Text fontSize="xs" style={{ color: 'var(--muted-text)' }} mb={1}>Language</Text>
                                            <select value={lang} onChange={e => setLang(e.target.value)} style={selectStyle}>
                                                <option value="en">English</option>
                                                <option value="fr">French</option>
                                                <option value="en+fr">English + French</option>
                                            </select>
                                        </Box>

                                        <Box>
                                            <Flex justify="space-between">
                                                <Text fontSize="xs" style={{ color: 'var(--muted-text)' }}>Price Column Start</Text>
                                                <Text fontSize="xs" style={{ color: 'var(--empty-text)' }}>{Math.round(priceColumnStart * 100)}%</Text>
                                            </Flex>
                                            <input
                                                type="range" min={0.3} max={0.95} step={0.01}
                                                value={priceColumnStart}
                                                onChange={e => setPriceColumnStart(parseFloat(e.target.value))}
                                                style={{ width: '100%' }}
                                            />
                                        </Box>
                                    </VStack>

                                    <VStack gap={3} align="stretch" flex={1}>
                                        <Box>
                                            <Flex justify="space-between">
                                                <Text fontSize="xs" style={{ color: 'var(--muted-text)' }}>Row Merge Distance</Text>
                                                <Text fontSize="xs" style={{ color: 'var(--empty-text)' }}>{(rowMergeDistance * 100).toFixed(1)}%</Text>
                                            </Flex>
                                            <input
                                                type="range" min={0.005} max={1.0} step={0.005}
                                                value={rowMergeDistance}
                                                onChange={e => setRowMergeDistance(parseFloat(e.target.value))}
                                                style={{ width: '100%' }}
                                            />
                                        </Box>

                                        <Box>
                                            <Text fontSize="xs" style={{ color: 'var(--muted-text)' }} mb={1}>Price Regex</Text>
                                            <Input
                                                size="sm" fontFamily="monospace" fontSize="xs"
                                                value={priceRegex}
                                                onChange={e => setPriceRegex(e.target.value)}
                                            />
                                        </Box>

                                        <Box>
                                            <Text fontSize="xs" style={{ color: 'var(--muted-text)' }} mb={1}>Skip Patterns (comma-separated)</Text>
                                            <Textarea
                                                size="sm" fontSize="xs" rows={2}
                                                value={skipPatterns}
                                                onChange={e => setSkipPatterns(e.target.value)}
                                            />
                                        </Box>
                                    </VStack>
                                </Flex>

                                <Flex gap={4} direction={{ base: 'column', md: 'row' }} mt={3}>
                                    <Box flex={1}>
                                        <Text fontSize="xs" style={{ color: 'var(--muted-text)' }} mb={1}>Summary Patterns (comma-separated)</Text>
                                        <Textarea
                                            size="sm" fontSize="xs" rows={2}
                                            value={summaryPatterns}
                                            onChange={e => setSummaryPatterns(e.target.value)}
                                        />
                                    </Box>
                                    <Box flex={1}>
                                        <Text fontSize="xs" style={{ color: 'var(--muted-text)' }} mb={1}>Receipt Layout</Text>
                                        <HStack gap={2}>
                                            <Button
                                                size="sm" flex={1}
                                                variant={layoutMode === 'title-above' ? 'solid' : 'outline'}
                                                colorScheme={layoutMode === 'title-above' ? 'blue' : 'gray'}
                                                onClick={() => setLayoutMode('title-above')}
                                            >Title Above</Button>
                                            <Button
                                                size="sm" flex={1}
                                                variant={layoutMode === 'details-below' ? 'solid' : 'outline'}
                                                colorScheme={layoutMode === 'details-below' ? 'blue' : 'gray'}
                                                onClick={() => setLayoutMode('details-below')}
                                            >Details Below</Button>
                                        </HStack>
                                        <Text fontSize="2xs" mt={1} style={{ color: 'var(--empty-text)' }}>
                                            {layoutMode === 'title-above'
                                                ? 'Item name is on the same line as price; extra lines below attach as detail'
                                                : 'Extra lines below the price line attach as item detail'}
                                        </Text>
                                    </Box>
                                </Flex>
                            </Box>
                        </Flex>
                    </VStack>
                )}
            </Box>
        </Box>
    );
};

export default ReceiptScanner;
