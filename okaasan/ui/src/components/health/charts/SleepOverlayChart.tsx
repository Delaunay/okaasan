import React, { useMemo } from 'react';
import VegaPlot from '../VegaPlot';
import { healthDataUrl } from '../../../services/api';

const STAGE_COLORS = {
    domain: ['Deep', 'Light', 'REM', 'Awake'],
    range: ['#1f4e79', '#6baed6', '#9ecae1', '#fdae6b'],
};

interface Props {
    start?: string;
    end?: string;
}

const SleepOverlayChart: React.FC<Props> = ({ start, end }) => {
    const nights = useMemo(() => {
        if (!start || !end) return 14;
        const days = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400_000);
        return Math.max(7, days);
    }, [start, end]);

    const spec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 300,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('sleep-overlay', { start, end, nights }) },
        mark: { type: 'bar', cornerRadius: 1, clip: true },
        encoding: {
            y: {
                field: 'weekday',
                type: 'nominal',
                title: null,
                sort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                axis: { labelPadding: 8 },
            },
            x: {
                field: 'start_h',
                type: 'quantitative',
                title: null, 
                scale: { domain: [21, 37] },
                axis: {
                    values: [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34],
                    labelExpr: "datum.value < 24 ? datum.value + ':00' : (datum.value - 24) + ':00'",
                    orient: 'bottom',
                    grid: true,
                    gridOpacity: 0.15,
                },
            },
            x2: { field: 'end_h' },
            color: {
                field: 'stage',
                type: 'nominal',
                title: 'Stage',
                scale: STAGE_COLORS,
            },
            opacity: {
                field: 'week_offset',
                type: 'quantitative',
                scale: { domain: [0, Math.max(1, nights - 1)], range: [0.9, 0.12] },
                legend: null,
            },
            tooltip: [
                { field: 'night', title: 'Date' },
                { field: 'weekday', title: 'Day' },
                { field: 'stage', title: 'Stage' },
                { field: 'hours', type: 'quantitative', title: 'Duration (h)', format: '.1f' },
            ],
        },
    }), [start, end, nights]);

    return <VegaPlot spec={spec} height="340px" />;
};

export default SleepOverlayChart;
