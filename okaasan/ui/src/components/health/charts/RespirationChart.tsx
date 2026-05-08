import React, { useMemo } from 'react';
import VegaPlot from '../VegaPlot';
import { healthDataUrl, endOfDay } from '../../../services/api';

interface Props {
    start?: string;
    end?: string;
}

const RespirationChart: React.FC<Props> = ({ start, end }) => {
    const spec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('respiration', { start, end }) },
        mark: { type: 'line', interpolate: 'monotone', strokeWidth: 1, opacity: 0.7 },
        encoding: {
            x: { field: 't', type: 'temporal', title: null, scale: { type: 'time', domain: start && end ? [start, endOfDay(end)] : undefined } },
            y: { field: 'v', type: 'quantitative', title: 'Breaths/min', scale: { zero: false } },
            color: { value: '#72b7b2' },
            tooltip: [
                { field: 't', type: 'temporal', title: 'Time' },
                { field: 'v', type: 'quantitative', title: 'Breaths/min' },
            ],
        },
    }), [start, end]);

    return <VegaPlot spec={spec} height="250px" />;
};

export default RespirationChart;
