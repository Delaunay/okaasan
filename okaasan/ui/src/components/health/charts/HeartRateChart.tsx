import React, { useMemo } from 'react';
import VegaPlot from '../VegaPlot';
import { healthDataUrl } from '../../../services/api';

interface Props {
    start?: string;
    end?: string;
}

const HeartRateChart: React.FC<Props> = ({ start, end }) => {
    const Sampling = 120
    const ObsPerDay = 3600 * 24 / Sampling

    const spec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 300,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('heart-rate', { start, end }) },
        layer: [
            {
                mark: { type: 'line', interpolate: 'monotone', strokeWidth: 1, opacity: 0.5 },
                encoding: {
                    x: { field: 't', type: 'temporal', title: null, scale: { type: 'time', domain: start && end ? [start, end] : undefined } },
                    y: { field: 'v', type: 'quantitative', title: 'BPM', scale: { zero: false } },
                },
            },
            {
                mark: { type: 'line', strokeWidth: 1, opacity: 0.8, interpolate: 'monotone', color: 'red' },
                transform: [
                    { window: [{ op: 'mean', field: 'v', as: 'rolling' }], frame: [-ObsPerDay, 0] },
                ],
                encoding: {
                    x: { field: 't', type: 'temporal', scale: { type: 'time', domain: start && end ? [start, end] : undefined } },
                    y: { field: 'rolling', type: 'quantitative' },
                },
            },
        ],
        encoding: {
            tooltip: [
                { field: 't', type: 'temporal', title: 'Time' },
                { field: 'v', type: 'quantitative', title: 'BPM' },
            ],
        },
    }), [start, end]);

    return <VegaPlot spec={spec} />;
};

export default HeartRateChart;
