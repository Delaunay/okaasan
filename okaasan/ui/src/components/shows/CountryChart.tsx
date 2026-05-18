import React, { useMemo } from 'react';
import VegaPlot from '../health/VegaPlot';

const COUNTRY_NAMES: Record<string, string> = {
  us: 'United States',
  gb: 'United Kingdom',
  fr: 'France',
  kr: 'South Korea',
  jp: 'Japan',
  ca: 'Canada',
  de: 'Germany',
  au: 'Australia',
  es: 'Spain',
  it: 'Italy',
  in: 'India',
  br: 'Brazil',
  mx: 'Mexico',
  se: 'Sweden',
  dk: 'Denmark',
  no: 'Norway',
  nz: 'New Zealand',
  ie: 'Ireland',
  be: 'Belgium',
  nl: 'Netherlands',
  cn: 'China',
  tw: 'Taiwan',
  th: 'Thailand',
  za: 'South Africa',
  ar: 'Argentina',
  co: 'Colombia',
  il: 'Israel',
  tr: 'Turkey',
  pl: 'Poland',
  at: 'Austria',
  ch: 'Switzerland',
  ru: 'Russia',
};

interface CountryChartProps {
  countries: [string, number][];
}

const CountryChart: React.FC<CountryChartProps> = ({ countries }) => {
  const spec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 280,
    height: 280,
    data: {
      values: countries.map(([code, count]) => ({
        country: COUNTRY_NAMES[code] || code.toUpperCase(),
        count,
      })),
    },
    mark: { type: 'arc', innerRadius: 50 },
    encoding: {
      theta: { field: 'count', type: 'quantitative', stack: true, sort: 'descending' },
      order: { field: 'count', type: 'quantitative', sort: 'descending' },
      color: {
        field: 'country',
        type: 'nominal',
        scale: { scheme: 'tableau20' },
        sort: { field: 'count', order: 'descending' },
        legend: { title: 'Country', orient: 'left', direction: 'vertical', columns: 1 },
      },
      tooltip: [
        { field: 'country', type: 'nominal', title: 'Country' },
        { field: 'count', type: 'quantitative', title: 'Count' },
      ],
    },
  }), [countries]);

  if (countries.length === 0) return null;

  return (
    <VegaPlot
      spec={spec}
      height="320px"
      configOverrides={{ legend: { orient: 'left', direction: 'vertical', columns: 1 } }}
    />
  );
};

export default CountryChart;
