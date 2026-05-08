import React, { useMemo } from 'react';
import VegaPlot from '../VegaPlot';
import { healthDataUrl } from '../../../services/api';

interface Props {
    start?: string;
    end?: string;
    field: string;
    title: string;
    color?: string;
    mark?: 'bar' | 'line' | 'area';
}

const DailySummaryChart: React.FC<Props> = ({ start, end, field, title, color = '#4c78a8', mark = 'bar' }) => {
    const spec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 200,
        autosize: { type: 'fit', contains: 'padding' },
        data: {
            url: healthDataUrl('daily-summary', { start, end }),
        },
        transform: [
            { filter: `datum.${field} != null` },
        ],
        mark: mark === 'area'
            ? { type: 'area', interpolate: 'monotone', opacity: 0.4, line: { strokeWidth: 1 } }
            : mark === 'line'
                ? { type: 'line', interpolate: 'monotone', strokeWidth: 1.5 }
                : { type: 'bar', opacity: 0.7 },
        encoding: {
            x: {
                field: 'day',
                type: 'temporal',
                title: null,
                scale: { type: 'time', domain: start && end ? [start, end] : undefined },
            },
            y: { field, type: 'quantitative', title },
            color: { value: color },
            tooltip: [
                { field: 'day', type: 'temporal', title: 'Date' },
                { field, type: 'quantitative', title },
            ],
        },
    }), [start, end, field, title, color, mark]);

    return <VegaPlot spec={spec} height="200px" />;
};

export default DailySummaryChart;
