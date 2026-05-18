import React, { useMemo } from 'react';
import VegaPlot from '../health/VegaPlot';

interface GenreChartProps {
  genres: [string, number][];
}

const GenreChart: React.FC<GenreChartProps> = ({ genres }) => {
  const spec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 280,
    height: 280,
    data: {
      values: genres.map(([genre, count]) => ({
        genre: genre.charAt(0).toUpperCase() + genre.slice(1),
        count,
      })),
    },
    mark: { type: 'arc', innerRadius: 50 },
    encoding: {
      theta: { field: 'count', type: 'quantitative', stack: true, sort: 'descending' },
      order: { field: 'count', type: 'quantitative', sort: 'descending' },
      color: {
        field: 'genre',
        type: 'nominal',
        scale: { scheme: 'category20' },
        sort: { field: 'count', order: 'descending' },
        legend: { title: 'Genre', orient: 'left', direction: 'vertical', columns: 1 },
      },
      tooltip: [
        { field: 'genre', type: 'nominal', title: 'Genre' },
        { field: 'count', type: 'quantitative', title: 'Count' },
      ],
    },
  }), [genres]);

  if (genres.length === 0) return null;

  return (
    <VegaPlot
      spec={spec}
      height="320px"
      configOverrides={{ legend: { orient: 'left', direction: 'vertical', columns: 1 } }}
    />
  );
};

export default GenreChart;
