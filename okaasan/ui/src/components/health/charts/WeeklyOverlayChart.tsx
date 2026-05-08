import React, { useMemo } from 'react';
import VegaPlot from '../VegaPlot';
import { healthDataUrl } from '../../../services/api';

const METRIC_LABELS: Record<string, { title: string; unit: string; color: string }> = {
    heart_rate: { title: 'Heart Rate', unit: 'BPM', color: '#e45755' },
    hrv: { title: 'HRV', unit: 'ms', color: '#4c78a8' },
    spo2: { title: 'SpO2', unit: '%', color: '#72b7b2' },
};

interface Props {
    metric?: string;
    weeks?: number;
    end?: string;
}

const WeeklyOverlayChart: React.FC<Props> = ({ metric = 'heart_rate', weeks = 4, end }) => {
    const info = METRIC_LABELS[metric] ?? { title: metric, unit: '', color: '#4c78a8' };
    const tzOffsetMin = useMemo(() => -new Date().getTimezoneOffset(), []);

    const spec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 350,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('weekly-overlay', { metric, weeks, end, tz_offset_min: tzOffsetMin }) },
        mark: { type: 'line', interpolate: 'monotone', strokeWidth: 2, clip: true },
        encoding: {
            x: {
                field: 'day_offset',
                type: 'quantitative',
                title: 'Day of Week',
                scale: { domain: [0, 6] },
                axis: {
                    values: [0, 1, 2, 3, 4, 5, 6],
                    labelExpr: "['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][datum.value]",
                },
            },
            y: { field: 'v', type: 'quantitative', title: info.unit, scale: { zero: false } },
            detail: { field: 'label', type: 'nominal' },
            color: { value: info.color },
            strokeOpacity: {
                field: 'week_offset',
                type: 'quantitative',
                scale: { domain: [0, Math.max(1, weeks - 1)], range: [1.0, 0.1] },
                legend: null,
            },
            tooltip: [
                { field: 'actual_date', type: 'temporal', title: 'Date' },
                { field: 'v', type: 'quantitative', title: info.unit },
                { field: 'label', title: 'Week' },
            ],
        },
    }), [metric, weeks, end, info]);

    return <VegaPlot spec={spec} height="350px" />;
};

export default WeeklyOverlayChart;
