import React, { useMemo } from 'react';
import VegaPlot from '../VegaPlot';
import { healthDataUrl, endOfDay } from '../../../services/api';

interface Props {
    start?: string;
    end?: string;
}

const COLOR = '#e45755';

const CaloriesChart: React.FC<Props> = ({ start, end }) => {
    const spec = useMemo(() => {
        const data = { url: healthDataUrl('daily-summary', { start, end }) };
        const filterTransform = [{ filter: 'datum.calories_total != null' }];

        return {
            $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
            autosize: { type: 'fit', contains: 'padding' },
            data,
            width: "container",
            height: 250,
            hconcat: [
                {
                    transform: filterTransform,
                    mark: { type: 'bar', opacity: 0.7 },
                    height: 210,
                    width: 450,
                    encoding: {
                        x: {
                            field: 'day',
                            type: 'temporal',
                            title: null,
                            scale: { type: 'time', domain: start && end ? [start, endOfDay(end)] : undefined },
                        },
                        y: { field: 'calories_total', type: 'quantitative', title: 'kcal' },
                        color: { value: COLOR },
                        tooltip: [
                            { field: 'day', type: 'temporal', title: 'Date' },
                            { field: 'calories_total', type: 'quantitative', title: 'kcal' },
                        ],
                    },
                },
                {
                    width: 50,
                    height: 250,
                    transform: [
                        ...filterTransform,
                        { aggregate: [
                            { op: 'min', field: 'calories_total', as: 'v_min' },
                            { op: 'q1', field: 'calories_total', as: 'v_q1' },
                            { op: 'median', field: 'calories_total', as: 'v_median' },
                            { op: 'mean', field: 'calories_total', as: 'v_mean' },
                            { op: 'q3', field: 'calories_total', as: 'v_q3' },
                            { op: 'max', field: 'calories_total', as: 'v_max' },
                        ]},
                    ],
                    layer: [
                        {
                            mark: { type: 'rule', strokeWidth: 1 },
                            encoding: {
                                x: { value: 25 },
                                y: { field: 'v_min', type: 'quantitative', title: null, axis: null },
                                y2: { field: 'v_max' },
                                color: { value: '#666' },
                            },
                        },
                        {
                            mark: { type: 'bar', width: 24, opacity: 0.5 },
                            encoding: {
                                x: { value: 25 },
                                y: { field: 'v_q1', type: 'quantitative' },
                                y2: { field: 'v_q3' },
                                color: { value: COLOR },
                            },
                        },
                        {
                            mark: { type: 'tick', width: 24, thickness: 2 },
                            encoding: {
                                x: { value: 25 },
                                y: { field: 'v_median', type: 'quantitative' },
                                color: { value: '#333' },
                            },
                        },
                        {
                            mark: { type: 'point', size: 40, filled: true },
                            encoding: {
                                x: { value: 25 },
                                y: { field: 'v_mean', type: 'quantitative' },
                                color: { value: COLOR },
                            },
                        },
                        {
                            mark: { type: 'text', align: 'left', dx: 22, fontSize: 9 },
                            encoding: {
                                x: { value: 25 },
                                y: { field: 'v_median', type: 'quantitative' },
                                text: { field: 'v_median', type: 'quantitative', format: '.0f' },
                            },
                        },
                    ],
                    encoding: {
                        tooltip: [
                            { field: 'v_max', type: 'quantitative', title: 'Max', format: '.0f' },
                            { field: 'v_q3', type: 'quantitative', title: 'Q3', format: '.0f' },
                            { field: 'v_mean', type: 'quantitative', title: 'Mean', format: '.0f' },
                            { field: 'v_median', type: 'quantitative', title: 'Median', format: '.0f' },
                            { field: 'v_q1', type: 'quantitative', title: 'Q1', format: '.0f' },
                            { field: 'v_min', type: 'quantitative', title: 'Min', format: '.0f' },
                        ],
                    },
                },
            ],
            resolve: { scale: { y: 'shared' } },
        };
    }, [start, end]);

    return <VegaPlot spec={spec} height="200px" />;
};

export default CaloriesChart;
