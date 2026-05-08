import React, { useMemo } from 'react';
import VegaPlot from '../VegaPlot';
import { healthDataUrl } from '../../../services/api';

interface Props {
    start?: string;
    end?: string;
}

const SpO2Chart: React.FC<Props> = ({ start, end }) => {
    const spec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 300,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('spo2', { start, end }) },
        mark: { type: 'line', point: true, interpolate: 'monotone' },
        encoding: {
            x: { field: 't', type: 'temporal', title: 'Time' },
            y: { field: 'v', type: 'quantitative', title: 'SpO2 %', scale: { domain: [85, 100] } },
            tooltip: [
                { field: 't', type: 'temporal', title: 'Time' },
                { field: 'v', type: 'quantitative', title: 'SpO2 %' },
            ],
        },
    }), [start, end]);

    return <VegaPlot spec={spec} />;
};

export default SpO2Chart;
