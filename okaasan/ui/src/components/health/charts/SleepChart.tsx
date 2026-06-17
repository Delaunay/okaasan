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
                width: 60,
                height: 250,
                title: { text: 'Avg', anchor: 'middle', fontSize: 11 },
                layer: [
                    {
                        transform: [
                            { aggregate: [{ op: 'sum', field: 'hours', as: 'night_total' }], groupby: ['date', 'stage'] },
                            { aggregate: [{ op: 'mean', field: 'night_total', as: 'avg_hours' }], groupby: ['stage'] },
                        ],
                        mark: { type: 'bar', width: 36 },
                        encoding: {
                            x: { value: 30 },
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
                            order: { field: 'stage', sort: 'ascending' },
                            tooltip: [
                                { field: 'stage', title: 'Stage' },
                                { field: 'avg_hours', type: 'quantitative', title: 'Avg Hours', format: '.1f' },
                            ],
                        },
                    },
                    {
                        transform: [
                            { aggregate: [{ op: 'sum', field: 'hours', as: 'total_hours' }], groupby: ['date'] },
                            {
                                joinaggregate: [
                                    { op: 'mean', field: 'total_hours', as: 'mean_h' },
                                    { op: 'median', field: 'total_hours', as: 'median_h' },
                                    { op: 'q1', field: 'total_hours', as: 'q1_h' },
                                    { op: 'q3', field: 'total_hours', as: 'q3_h' },
                                    { op: 'min', field: 'total_hours', as: 'min_h' },
                                    { op: 'max', field: 'total_hours', as: 'max_h' },
                                ],
                            },
                        ],
                        layer: [
                            {
                                mark: { type: 'rule', strokeWidth: 1.5, color: '#e2e8f0' },
                                encoding: {
                                    y: { field: 'min_h', type: 'quantitative' },
                                    y2: { field: 'max_h' },
                                    x: { value: 30 },
                                },
                            },
                            {
                                mark: { type: 'rect', opacity: 0.25, color: '#e2e8f0', cornerRadius: 2 },
                                encoding: {
                                    y: { field: 'q1_h', type: 'quantitative', title: null },
                                    y2: { field: 'q3_h' },
                                    x: { value: 18 },
                                    x2: { value: 42 },
                                },
                            },
                            {
                                mark: { type: 'tick', thickness: 2.5, size: 24, color: '#f59e0b' },
                                encoding: {
                                    y: { field: 'median_h', type: 'quantitative' },
                                    x: { value: 30 },
                                    tooltip: [{ field: 'median_h', type: 'quantitative', title: 'Median', format: '.1f' }],
                                },
                            },
                            {
                                mark: { type: 'point', shape: 'diamond', size: 45, filled: true, color: '#e45756' },
                                encoding: {
                                    y: { field: 'mean_h', type: 'quantitative' },
                                    x: { value: 30 },
                                    tooltip: [{ field: 'mean_h', type: 'quantitative', title: 'Mean', format: '.1f' }],
                                },
                            },
                        ],
                    },
                ],
            },
        ],
        resolve: { scale: { color: 'shared', y: 'shared' } },
    }), [start, end]);

    return <VegaPlot spec={spec} height="250px" />;
};

export default SleepChart;
