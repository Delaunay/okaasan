import React, { useMemo } from 'react';
import VegaPlot from '../VegaPlot';
import { healthDataUrl } from '../../../services/api';

interface Props {
    start?: string;
    end?: string;
}

const ActivityChart: React.FC<Props> = ({ start, end }) => {
    const spec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('activities', { start, end }) },
        mark: { type: 'bar' },
        encoding: {
            x: { field: 'date', type: 'temporal', title: 'Date', scale: { type: 'time', domain: start && end ? [start, end] : undefined } },
            y: { field: 'duration_min', type: 'quantitative', title: 'Duration (min)' },
            color: { field: 'type', type: 'nominal', title: 'Type' },
            tooltip: [
                { field: 'date', type: 'temporal', title: 'Date' },
                { field: 'type', title: 'Activity' },
                { field: 'duration_min', type: 'quantitative', title: 'Minutes', format: '.0f' },
                { field: 'distance_km', type: 'quantitative', title: 'Distance (km)', format: '.1f' },
            ],
        },
    }), [start, end]);

    return <VegaPlot spec={spec} height="250px" />;
};

export default ActivityChart;
