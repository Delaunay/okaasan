import React, { useMemo } from 'react';
import VegaPlot from '../VegaPlot';
import { healthDataUrl } from '../../../services/api';

interface Props {
    start?: string;
    end?: string;
}

const VO2MaxChart: React.FC<Props> = ({ start, end }) => {
    const spec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 300,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('vo2max', { start, end }) },
        layer: [
            {
                mark: { type: 'point', size: 60, filled: true },
                encoding: {
                    x: { field: 't', type: 'temporal', title: 'Date' },
                    y: { field: 'v', type: 'quantitative', title: 'mL/kg/min', scale: { zero: false } },
                },
            },
            {
                mark: { type: 'line', color: '#4c78a8', strokeWidth: 2 },
                transform: [
                    { window: [{ op: 'mean', field: 'v', as: 'trend' }], frame: [-2, 2] },
                ],
                encoding: {
                    x: { field: 't', type: 'temporal' },
                    y: { field: 'trend', type: 'quantitative' },
                },
            },
        ],
    }), [start, end]);

    return <VegaPlot spec={spec} />;
};

export default VO2MaxChart;
