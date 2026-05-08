import React, { useMemo } from 'react';
import VegaPlot from '../VegaPlot';
import { healthDataUrl, endOfDay } from '../../../services/api';

interface Props {
    start?: string;
    end?: string;
}

const BodyBatteryChart: React.FC<Props> = ({ start, end }) => {
    const spec = useMemo(() => ({
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        width: 'container',
        height: 250,
        autosize: { type: 'fit', contains: 'padding' },
        data: { url: healthDataUrl('body-battery', { start, end }) },
        mark: { type: 'area', interpolate: 'monotone', opacity: 0.4, line: { strokeWidth: 1 } },
        encoding: {
            x: { field: 't', type: 'temporal', title: null, scale: { type: 'time', domain: start && end ? [start, endOfDay(end)] : undefined } },
            y: { field: 'v', type: 'quantitative', title: 'Body Battery', scale: { domain: [0, 100] } },
            color: { value: '#54a24b' },
            tooltip: [
                { field: 't', type: 'temporal', title: 'Time' },
                { field: 'v', type: 'quantitative', title: 'Body Battery' },
            ],
        },
    }), [start, end]);

    return <VegaPlot spec={spec} height="250px" />;
};

export default BodyBatteryChart;
