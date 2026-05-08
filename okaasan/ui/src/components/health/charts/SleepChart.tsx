import React, { useMemo } from 'react';
import VegaPlot from '../VegaPlot';
import { healthDataUrl } from '../../../services/api';

interface Props {
    start?: string;
    end?: string;
}

const STAGE_COLORS = {
    domain: ['Deep', 'Light', 'REM', 'Awake'],
    range: ['#1f4e79', '#6baed6', '#9ecae1', '#fdae6b'],
};

const SleepChart: React.FC<Props> = ({ start, end }) => {
    const spec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('sleep', { start, end }) },
        mark: { type: 'bar' },
        encoding: {
            x: {
                field: 'date',
                type: 'temporal',
                title: 'Night',
                scale: { type: 'time', domain: start && end ? [start, end] : undefined },
            },
            y: { field: 'hours', type: 'quantitative', title: 'Hours', stack: true },
            color: {
                field: 'stage',
                type: 'nominal',
                title: 'Stage',
                scale: STAGE_COLORS,
            },
            tooltip: [
                { field: 'date', type: 'temporal', title: 'Night' },
                { field: 'stage', title: 'Stage' },
                { field: 'hours', type: 'quantitative', title: 'Hours', format: '.1f' },
            ],
        },
    }), [start, end]);

    return <VegaPlot spec={spec} height="250px" />;
};

export default SleepChart;
