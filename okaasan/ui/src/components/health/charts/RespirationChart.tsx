import React, { useMemo } from 'react';
import VegaPlot from '../VegaPlot';
import { healthDataUrl, endOfDay } from '../../../services/api';

interface Props {
    start?: string;
    end?: string;
}

const COLOR = '#72b7b2';

const RespirationChart: React.FC<Props> = ({ start, end }) => {
    const xDomain = start && end ? [start, endOfDay(end)] : undefined;
    const data = { url: healthDataUrl('respiration', { start, end }) };

    const spec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        autosize: { type: 'fit', contains: 'padding' },
        data,
        hconcat: [
            {
                mark: { type: 'line', interpolate: 'monotone', strokeWidth: 1, opacity: 0.7 },
                height: 250,
                width: 450,
                encoding: {
                    x: { field: 't', type: 'temporal', title: null, scale: { type: 'time', domain: xDomain } },
                    y: { field: 'v', type: 'quantitative', title: 'Breaths/min', scale: { zero: false } },
                    color: { value: COLOR },
                    tooltip: [
                        { field: 't', type: 'temporal', title: 'Time' },
                        { field: 'v', type: 'quantitative', title: 'Breaths/min' },
                    ],
                },
            },
            {
                width: 50,
                height: 250,
                transform: [
                    { aggregate: [
                        { op: 'min', field: 'v', as: 'v_min' },
                        { op: 'q1', field: 'v', as: 'v_q1' },
                        { op: 'median', field: 'v', as: 'v_median' },
                        { op: 'mean', field: 'v', as: 'v_mean' },
                        { op: 'q3', field: 'v', as: 'v_q3' },
                        { op: 'max', field: 'v', as: 'v_max' },
                    ]},
                ],
                layer: [
                    { mark: { type: 'rule', strokeWidth: 1 }, encoding: { x: { value: 25 }, y: { field: 'v_min', type: 'quantitative', title: null, axis: null }, y2: { field: 'v_max' }, color: { value: '#666' } } },
                    { mark: { type: 'bar', width: 24, opacity: 0.5 }, encoding: { x: { value: 25 }, y: { field: 'v_q1', type: 'quantitative' }, y2: { field: 'v_q3' }, color: { value: COLOR } } },
                    { mark: { type: 'tick', width: 24, thickness: 2 }, encoding: { x: { value: 25 }, y: { field: 'v_median', type: 'quantitative' }, color: { value: '#333' } } },
                    { mark: { type: 'point', size: 40, filled: true }, encoding: { x: { value: 25 }, y: { field: 'v_mean', type: 'quantitative' }, color: { value: COLOR } } },
                    { mark: { type: 'text', align: 'left', dx: 22, fontSize: 9 }, encoding: { x: { value: 25 }, y: { field: 'v_median', type: 'quantitative' }, text: { field: 'v_median', type: 'quantitative', format: '.1f' } } },
                ],
                encoding: {
                    tooltip: [
                        { field: 'v_max', type: 'quantitative', title: 'Max', format: '.1f' },
                        { field: 'v_q3', type: 'quantitative', title: 'Q3', format: '.1f' },
                        { field: 'v_mean', type: 'quantitative', title: 'Mean', format: '.1f' },
                        { field: 'v_median', type: 'quantitative', title: 'Median', format: '.1f' },
                        { field: 'v_q1', type: 'quantitative', title: 'Q1', format: '.1f' },
                        { field: 'v_min', type: 'quantitative', title: 'Min', format: '.1f' },
                    ],
                },
            },
        ],
        resolve: { scale: { y: 'shared' } },
    }), [start, end]);

    return <VegaPlot spec={spec} height="250px" />;
};

export default RespirationChart;
