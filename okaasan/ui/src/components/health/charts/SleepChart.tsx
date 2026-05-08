import React, { useMemo } from 'react';
import VegaPlot from '../VegaPlot';
import { healthDataUrl, endOfDay } from '../../../services/api';

interface Props {
    start?: string;
    end?: string;
}

const STAGE_COLORS = {
    domain: ['Deep', 'Light', 'REM', 'Awake'],
    range: ['#1f4e79', '#6baed6', '#9ecae1', '#fdae6b'],
};

const STAGE_ORDER = ['Deep', 'Light', 'REM', 'Awake'];

const SleepChart: React.FC<Props> = ({ start, end }) => {
    const spec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('sleep', { start, end }) },
        width: 'container',
        height: 250,
        hconcat: [
            {
                mark: { type: 'bar' },
                height: 250,
                width: 450,
                encoding: {
                    x: {
                        field: 'date',
                        type: 'temporal',
                        title: null,
                        scale: { type: 'time', domain: start && end ? [start, endOfDay(end)] : undefined },
                    },
                    y: { field: 'hours', type: 'quantitative', title: 'Hours', stack: true },
                    color: {
                        field: 'stage',
                        type: 'nominal',
                        scale: STAGE_COLORS,
                        sort: STAGE_ORDER,
                        legend: { title: null },
                    },
                    tooltip: [
                        { field: 'date', type: 'temporal', title: 'Night' },
                        { field: 'stage', title: 'Stage' },
                        { field: 'hours', type: 'quantitative', title: 'Hours', format: '.1f' },
                    ],
                },
            },
            {
                width: 40,
                height: 250,
                title: { text: '', anchor: 'middle' },
                transform: [
                    { aggregate: [{ op: 'sum', field: 'hours', as: 'night_total' }], groupby: ['date', 'stage'] },
                    { aggregate: [{ op: 'mean', field: 'night_total', as: 'avg_hours' }], groupby: ['stage'] },
                ],
                mark: { type: 'bar', width: 30 },
                encoding: {
                    x: { value: 20 },
                    y: {
                        field: 'avg_hours',
                        type: 'quantitative',
                        title: null,
                        stack: true,
                        axis: null,
                    },
                    color: {
                        field: 'stage',
                        type: 'nominal',
                        scale: STAGE_COLORS,
                        sort: STAGE_ORDER,
                        legend: null,
                    },
                    order: {
                        field: 'stage',
                        sort: 'ascending',
                    },
                    tooltip: [
                        { field: 'stage', title: 'Stage' },
                        { field: 'avg_hours', type: 'quantitative', title: 'Avg Hours', format: '.1f' },
                    ],
                },
            },
        ],
        resolve: { scale: { color: 'shared', y: 'shared' } },
    }), [start, end]);

    return <VegaPlot spec={spec} height="250px" />;
};

export default SleepChart;
