import React, { useMemo } from 'react';
import VegaPlot from '../VegaPlot';
import { healthDataUrl, endOfDay } from '../../../services/api';

interface Props {
    start?: string;
    end?: string;
}

const StepsChart: React.FC<Props> = ({ start, end }) => {
    const spec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('steps', { start, end }) },
        mark: { type: 'bar', opacity: 0.7 },
        encoding: {
            x: { field: 't', type: 'temporal', title: null, scale: { type: 'time', domain: start && end ? [start, endOfDay(end)] : undefined } },
            y: { field: 'v', type: 'quantitative', title: 'Steps' },
            color: { value: '#4c78a8' },
            tooltip: [
                { field: 't', type: 'temporal', title: 'Time' },
                { field: 'v', type: 'quantitative', title: 'Steps' },
            ],
        },
    }), [start, end]);

    return <VegaPlot spec={spec} height="250px" />;
};

export default StepsChart;
