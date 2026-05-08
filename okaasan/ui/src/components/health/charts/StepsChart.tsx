import React, { useMemo } from 'react';
import VegaPlot from '../VegaPlot';
import { healthDataUrl, endOfDay } from '../../../services/api';

interface Props {
    start?: string;
    end?: string;
}

const COLOR = '#4c78a8';
const FIELD = 'daily_steps';

const StepsChart: React.FC<Props> = ({ start, end }) => {
    const xDomain = start && end ? [start, endOfDay(end)] : undefined;
    const data = { url: healthDataUrl('steps', { start, end }) };
    const dayTransform = [
        { timeUnit: 'yearmonthdate' as const, field: 't', as: 'day' },
        { aggregate: [{ op: 'sum' as const, field: 'v', as: FIELD }], groupby: ['day'] },
    ];

    const spec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        autosize: { type: 'fit', contains: 'padding' },
        data,
        hconcat: [
            {
                transform: dayTransform,
                mark: { type: 'bar', opacity: 0.7 },
                height: 250,
                width: 450,
                encoding: {
                    x: { field: 'day', type: 'temporal', title: null, scale: { type: 'time', domain: xDomain } },
                    y: { field: FIELD, type: 'quantitative', title: 'Steps' },
                    color: { value: COLOR },
                    tooltip: [
                        { field: 'day', type: 'temporal', title: 'Date' },
                        { field: FIELD, type: 'quantitative', title: 'Steps', format: ',' },
                    ],
                },
            },
            {
                width: 50,
                height: 250,
                transform: [
                    ...dayTransform,
                    { aggregate: [
                        { op: 'min', field: FIELD, as: 'v_min' },
                        { op: 'q1', field: FIELD, as: 'v_q1' },
                        { op: 'median', field: FIELD, as: 'v_median' },
                        { op: 'mean', field: FIELD, as: 'v_mean' },
                        { op: 'q3', field: FIELD, as: 'v_q3' },
                        { op: 'max', field: FIELD, as: 'v_max' },
                    ]},
                ],
                layer: [
                    { mark: { type: 'rule', strokeWidth: 1 }, encoding: { x: { value: 25 }, y: { field: 'v_min', type: 'quantitative', title: null, axis: null }, y2: { field: 'v_max' }, color: { value: '#666' } } },
                    { mark: { type: 'bar', width: 24, opacity: 0.5 }, encoding: { x: { value: 25 }, y: { field: 'v_q1', type: 'quantitative' }, y2: { field: 'v_q3' }, color: { value: COLOR } } },
                    { mark: { type: 'tick', width: 24, thickness: 2 }, encoding: { x: { value: 25 }, y: { field: 'v_median', type: 'quantitative' }, color: { value: '#333' } } },
                    { mark: { type: 'point', size: 40, filled: true }, encoding: { x: { value: 25 }, y: { field: 'v_mean', type: 'quantitative' }, color: { value: COLOR } } },
                    { mark: { type: 'text', align: 'left', dx: 22, fontSize: 9 }, encoding: { x: { value: 25 }, y: { field: 'v_median', type: 'quantitative' }, text: { field: 'v_median', type: 'quantitative', format: ',.0f' } } },
                ],
                encoding: {
                    tooltip: [
                        { field: 'v_max', type: 'quantitative', title: 'Max', format: ',.0f' },
                        { field: 'v_q3', type: 'quantitative', title: 'Q3', format: ',.0f' },
                        { field: 'v_mean', type: 'quantitative', title: 'Mean', format: ',.0f' },
                        { field: 'v_median', type: 'quantitative', title: 'Median', format: ',.0f' },
                        { field: 'v_q1', type: 'quantitative', title: 'Q1', format: ',.0f' },
                        { field: 'v_min', type: 'quantitative', title: 'Min', format: ',.0f' },
                    ],
                },
            },
        ],
        resolve: { scale: { y: 'shared' } },
    }), [start, end]);

    return <VegaPlot spec={spec} height="250px" />;
};

export default StepsChart;
