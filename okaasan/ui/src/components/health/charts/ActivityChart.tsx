import React, { useMemo } from 'react';
import VegaPlot from '../VegaPlot';
import { healthDataUrl } from '../../../services/api';

interface Props {
    start?: string;
    end?: string;
}

const ActivityChart: React.FC<Props> = ({ start, end }) => {
    const domainStart = start ? start + 'T00:00:00Z' : undefined;
    const domainEnd = end ? end + 'T23:59:59Z' : undefined;

    const spec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 356,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('activities', { start, end }) },
        transform: [
            { timeUnit: 'utcyearmonthdate', field: 'date', as: 'day' },
        ],
        mark: { type: 'bar', cornerRadiusEnd: 3, size: 6 },
        encoding: {
            x: { field: 'day', type: 'temporal', title: null, scale: { type: 'utc', domain: domainStart && domainEnd ? [domainStart, domainEnd] : undefined } },
            y: { field: 'duration_min', type: 'quantitative', title: 'Duration (min)', stack: true },
            color: { field: 'type', type: 'nominal', legend: { title: null } },
            tooltip: [
                { field: 'date', type: 'temporal', title: 'Date', timeUnit: 'utcyearmonthdatehoursminutes' },
                { field: 'type', title: 'Activity' },
                { field: 'duration_min', type: 'quantitative', title: 'Minutes', format: '.0f' },
                { field: 'distance_km', type: 'quantitative', title: 'Distance (km)', format: '.1f' },
            ],
        },
    }), [start, end, domainStart, domainEnd]);

    return <VegaPlot spec={spec} height="250px" />;
};

export default ActivityChart;
