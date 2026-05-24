import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Flex, Heading, Text, VStack, HStack, Input, Button, Badge } from '@chakra-ui/react';
import { ArrowLeft, Save, Trash2, FolderOpen } from 'lucide-react';
import { privateJsonStore } from '../../services/jsonstore';
import VegaPlot from '../health/VegaPlot';
import { VegaProvider } from '../../contexts/VegaContext';

interface RetirementInputs {
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  currentSavings: number;
  monthlyContribution: number;
  annualReturn: number;
  inflationRate: number;
  desiredAnnualIncome: number;
  monthlyPension: number;
  employerMatchPct: number;
  employerMatchCap: number;
}

const DEFAULTS: RetirementInputs = {
  currentAge: 30,
  retirementAge: 65,
  lifeExpectancy: 90,
  currentSavings: 50000,
  monthlyContribution: 1500,
  annualReturn: 7,
  inflationRate: 2.5,
  desiredAnnualIncome: 60000,
  monthlyPension: 1500,
  employerMatchPct: 0,
  employerMatchCap: 0,
};

const COLLECTION = 'retirement';

function computeProjection(inputs: RetirementInputs) {
  const {
    currentAge, retirementAge, lifeExpectancy, currentSavings,
    monthlyContribution, annualReturn, inflationRate,
    desiredAnnualIncome, monthlyPension, employerMatchPct, employerMatchCap,
  } = inputs;

  const monthlyReturn = annualReturn / 100 / 12;
  const monthlyInflation = inflationRate / 100 / 12;
  const employerMatch = Math.min(monthlyContribution * employerMatchPct / 100, employerMatchCap);
  const totalMonthly = monthlyContribution + employerMatch;

  const points: { age: number; savings: number; contributions: number; growth: number; employer: number; phase: string }[] = [];

  let savings = currentSavings;
  let totalContribs = currentSavings;
  let totalEmployer = 0;

  for (let age = currentAge; age <= lifeExpectancy; age++) {
    const phase = age < retirementAge ? 'Accumulation' : 'Drawdown';
    const growth = savings - totalContribs - totalEmployer;
    points.push({ age, savings: Math.max(0, savings), contributions: totalContribs, growth: Math.max(0, growth), employer: totalEmployer, phase });

    if (age < retirementAge) {
      for (let m = 0; m < 12; m++) {
        savings = savings * (1 + monthlyReturn) + totalMonthly;
        totalContribs += monthlyContribution;
        totalEmployer += employerMatch;
      }
    } else {
      const yearsInRetirement = age - retirementAge;
      const inflationFactor = Math.pow(1 + inflationRate / 100, yearsInRetirement);
      const adjustedIncome = desiredAnnualIncome * inflationFactor;
      const adjustedPension = monthlyPension * 12 * inflationFactor;
      const withdrawal = Math.max(0, adjustedIncome - adjustedPension);
      for (let m = 0; m < 12; m++) {
        savings = savings * (1 + monthlyReturn) - withdrawal / 12;
      }
    }
  }

  const savingsAtRetirement = points.find(p => p.age === retirementAge)?.savings || 0;
  const inflationAtRetirement = Math.pow(1 + inflationRate / 100, retirementAge - currentAge);
  const realDesiredIncome = desiredAnnualIncome * inflationAtRetirement;
  const annualPensionAtRetirement = monthlyPension * 12;
  const annualGapAtRetirement = realDesiredIncome - annualPensionAtRetirement;

  const drawdownYears = lifeExpectancy - retirementAge;
  const realReturn = (1 + annualReturn / 100) / (1 + inflationRate / 100) - 1;
  const neededAtRetirement = annualGapAtRetirement > 0 && realReturn > 0
    ? annualGapAtRetirement * (1 - Math.pow(1 + realReturn, -drawdownYears)) / realReturn
    : annualGapAtRetirement * drawdownYears;

  const runsOutAge = points.find(p => p.age > retirementAge && p.savings <= 0)?.age;

  return { points, savingsAtRetirement, neededAtRetirement, runsOutAge };
}

function sensitivityData(inputs: RetirementInputs) {
  const rates = [3, 4, 5, 6, 7, 8, 9, 10];
  const results: { rate: number; savingsAtRetirement: number }[] = [];
  for (const r of rates) {
    const proj = computeProjection({ ...inputs, annualReturn: r });
    results.push({ rate: r, savingsAtRetirement: proj.savingsAtRetirement });
  }
  return results;
}

const Field: React.FC<{ label: string; suffix?: string; value: number; onChange: (v: number) => void }> = ({ label, suffix, value, onChange }) => (
  <Box>
    <Text fontSize="xs" fontWeight="bold" mb={1}>{label}</Text>
    <HStack>
      <Input
        type="number"
        size="sm"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        maxW="140px"
      />
      {suffix && <Text fontSize="xs" color="var(--muted-text)">{suffix}</Text>}
    </HStack>
  </Box>
);

const RetirementPlanner: React.FC = () => {
  const { scenario: urlScenario } = useParams<{ scenario: string }>();
  const navigate = useNavigate();
  const [inputs, setInputs] = useState<RetirementInputs>(DEFAULTS);
  const [scenarioName, setScenarioName] = useState(urlScenario || '');
  const [scenarios, setScenarios] = useState<string[]>([]);

  const set = useCallback(<K extends keyof RetirementInputs>(key: K, val: RetirementInputs[K]) => {
    setInputs(prev => ({ ...prev, [key]: val }));
  }, []);

  const loadScenarios = useCallback(async () => {
    try { setScenarios(await privateJsonStore.list(COLLECTION)); } catch { /* empty */ }
  }, []);

  useEffect(() => { loadScenarios(); }, [loadScenarios]);

  useEffect(() => {
    if (urlScenario) {
      privateJsonStore.get<RetirementInputs>(COLLECTION, urlScenario)
        .then(data => { setInputs(data); setScenarioName(urlScenario); })
        .catch(() => {});
    }
  }, [urlScenario]);

  const handleSave = async () => {
    const name = scenarioName.trim();
    if (!name) return;
    await privateJsonStore.put(COLLECTION, name, inputs);
    await loadScenarios();
    navigate(`/investing/retirement/${encodeURIComponent(name)}`, { replace: true });
  };

  const handleDelete = async () => {
    const name = scenarioName.trim();
    if (!name) return;
    await privateJsonStore.remove(COLLECTION, name);
    setScenarioName('');
    setInputs(DEFAULTS);
    await loadScenarios();
    navigate('/investing/retirement', { replace: true });
  };

  const projection = useMemo(() => computeProjection(inputs), [inputs]);
  const sensitivity = useMemo(() => sensitivityData(inputs), [inputs]);

  const projectionSpec = useMemo(() => {
    if (projection.points.length === 0) return null;
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 300,
      title: { text: 'Projected Savings Over Time', anchor: 'middle' as const, offset: 12 },
      data: { values: projection.points },
      layer: [
        {
          mark: { type: 'area', interpolate: 'monotone', opacity: 0.3 },
          encoding: {
            x: { field: 'age', type: 'quantitative', title: 'Age', scale: { zero: false } },
            y: { field: 'savings', type: 'quantitative', title: 'Savings ($)', axis: { format: '~s', titlePadding: 16 } },
            color: {
              field: 'phase', type: 'nominal',
              scale: { domain: ['Accumulation', 'Drawdown'], range: ['#3b82f6', '#f59e0b'] },
              legend: { title: null },
            },
          },
        },
        {
          mark: { type: 'line', interpolate: 'monotone', strokeWidth: 2 },
          encoding: {
            x: { field: 'age', type: 'quantitative' },
            y: { field: 'savings', type: 'quantitative' },
            color: { field: 'phase', type: 'nominal' },
            tooltip: [
              { field: 'age', type: 'quantitative', title: 'Age' },
              { field: 'savings', type: 'quantitative', title: 'Savings', format: '$,.0f' },
              { field: 'phase', type: 'nominal', title: 'Phase' },
            ],
          },
        },
        {
          mark: { type: 'rule', strokeDash: [4, 3], color: '#94a3b8' },
          encoding: { x: { datum: inputs.retirementAge } },
        },
      ],
    };
  }, [projection, inputs.retirementAge]);

  const breakdownSpec = useMemo(() => {
    const atRetirement = projection.points.find(p => p.age === inputs.retirementAge);
    if (!atRetirement) return null;
    const data = [
      { category: 'Your Contributions', value: atRetirement.contributions },
      { category: 'Employer Match', value: atRetirement.employer },
      { category: 'Investment Growth', value: atRetirement.growth },
    ].filter(d => d.value > 0);
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 200,
      title: { text: 'Savings Breakdown at Retirement', anchor: 'middle' as const, offset: 12 },
      data: { values: data },
      mark: { type: 'arc', innerRadius: 50, tooltip: true },
      encoding: {
        theta: { field: 'value', type: 'quantitative' },
        color: {
          field: 'category', type: 'nominal',
          scale: { range: ['#3b82f6', '#22c55e', '#f59e0b'] },
          legend: { title: null, orient: 'left', direction: 'vertical', rowPadding: 8, labelOffset: 8 },
        },
        tooltip: [
          { field: 'category', type: 'nominal', title: 'Source' },
          { field: 'value', type: 'quantitative', title: 'Amount', format: '$,.0f' },
        ],
      },
    };
  }, [projection, inputs.retirementAge]);

  const sensitivitySpec = useMemo(() => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container' as const,
    height: 200,
    title: { text: 'Sensitivity: Return Rate vs Savings at Retirement', anchor: 'middle' as const, offset: 12 },
    data: { values: sensitivity },
    mark: { type: 'bar', tooltip: true, cornerRadiusTopLeft: 3, cornerRadiusTopRight: 3 },
    encoding: {
      x: { field: 'rate', type: 'ordinal', title: 'Annual Return (%)' },
      y: { field: 'savingsAtRetirement', type: 'quantitative', title: 'Savings ($)', axis: { format: '~s', titlePadding: 16 } },
      color: {
        condition: { test: `datum.rate === ${inputs.annualReturn}`, value: '#3b82f6' },
        value: '#94a3b8',
      },
      tooltip: [
        { field: 'rate', type: 'quantitative', title: 'Return %' },
        { field: 'savingsAtRetirement', type: 'quantitative', title: 'Savings', format: '$,.0f' },
      ],
    },
  }), [sensitivity, inputs.annualReturn]);

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const onTrack = projection.savingsAtRetirement >= projection.neededAtRetirement;

  return (
    <VStack align="stretch" gap={6} p={0}>
      <HStack gap={3}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/investing')}>
          <ArrowLeft size={16} />
        </Button>
        <Heading size="xl" color="var(--heading-color)">Retirement Planner</Heading>
      </HStack>

      {/* Scenario management */}
      <HStack gap={2} flexWrap="wrap">
        <Input
          placeholder="Scenario name"
          value={scenarioName}
          onChange={e => setScenarioName(e.target.value)}
          size="sm"
          maxW="200px"
        />
        <Button size="sm" onClick={handleSave} disabled={!scenarioName.trim()}>
          <Save size={14} /> Save
        </Button>
        {scenarioName && scenarios.includes(scenarioName) && (
          <Button size="sm" variant="ghost" onClick={handleDelete}>
            <Trash2 size={14} />
          </Button>
        )}
        {scenarios.map(s => (
          <Button
            key={s}
            size="xs"
            variant={s === scenarioName ? 'solid' : 'outline'}
            colorPalette={s === scenarioName ? 'blue' : undefined}
            onClick={() => navigate(`/investing/retirement/${encodeURIComponent(s)}`)}
          >
            <FolderOpen size={12} /> {s}
          </Button>
        ))}
      </HStack>

      {/* Inputs */}
      <Flex gap={4} flexWrap="wrap">
        <Box flex="1 1 280px" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" p={4}>
          <Heading size="sm" mb={3} color="var(--heading-color)">Personal</Heading>
          <VStack align="stretch" gap={3}>
            <Field label="Current Age" value={inputs.currentAge} onChange={v => set('currentAge', v)} />
            <Field label="Retirement Age" value={inputs.retirementAge} onChange={v => set('retirementAge', v)} />
            <Field label="Life Expectancy" value={inputs.lifeExpectancy} onChange={v => set('lifeExpectancy', v)} />
          </VStack>
        </Box>
        <Box flex="1 1 280px" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" p={4}>
          <Heading size="sm" mb={3} color="var(--heading-color)">Savings</Heading>
          <VStack align="stretch" gap={3}>
            <Field label="Current Savings" suffix="$" value={inputs.currentSavings} onChange={v => set('currentSavings', v)} />
            <Field label="Monthly Contribution" suffix="$/mo" value={inputs.monthlyContribution} onChange={v => set('monthlyContribution', v)} />
            <Field label="Employer Match" suffix="%" value={inputs.employerMatchPct} onChange={v => set('employerMatchPct', v)} />
            <Field label="Employer Match Cap" suffix="$/mo" value={inputs.employerMatchCap} onChange={v => set('employerMatchCap', v)} />
          </VStack>
        </Box>
        <Box flex="1 1 280px" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" p={4}>
          <Heading size="sm" mb={3} color="var(--heading-color)">Assumptions</Heading>
          <VStack align="stretch" gap={3}>
            <Field label="Annual Return" suffix="%" value={inputs.annualReturn} onChange={v => set('annualReturn', v)} />
            <Field label="Inflation Rate" suffix="%" value={inputs.inflationRate} onChange={v => set('inflationRate', v)} />
            <Field label="Desired Annual Income" suffix="$" value={inputs.desiredAnnualIncome} onChange={v => set('desiredAnnualIncome', v)} />
            <Field label="Monthly Pension / CPP / SS" suffix="$/mo" value={inputs.monthlyPension} onChange={v => set('monthlyPension', v)} />
          </VStack>
        </Box>
      </Flex>

      {/* Summary */}
      <Flex gap={4} flexWrap="wrap">
        <SummaryCard label="Savings at Retirement" value={fmt(projection.savingsAtRetirement)} />
        <SummaryCard label="Estimated Need" value={fmt(projection.neededAtRetirement)} />
        <SummaryCard
          label="Status"
          value={onTrack ? 'On Track' : 'Shortfall'}
          color={onTrack ? 'var(--panel-green-text, #22c55e)' : 'var(--panel-red-text, #ef4444)'}
        />
        {projection.runsOutAge && (
          <SummaryCard label="Money Runs Out At" value={`Age ${projection.runsOutAge}`} color="var(--panel-red-text, #ef4444)" />
        )}
      </Flex>

      {/* Charts */}
      {projectionSpec && (
        <VegaProvider><VegaPlot spec={projectionSpec} height="340px" /></VegaProvider>
      )}

      <Flex gap={4} flexWrap="wrap">
        <Box flex="1 1 400px">
          {breakdownSpec && (
            <VegaProvider><VegaPlot spec={breakdownSpec} height="240px" /></VegaProvider>
          )}
        </Box>
        <Box flex="1 1 400px">
          <VegaProvider><VegaPlot spec={sensitivitySpec} height="240px" /></VegaProvider>
        </Box>
      </Flex>
    </VStack>
  );
};

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box
      flex="1 1 160px"
      bg="var(--card-bg)"
      border="1px solid"
      borderColor="var(--border-color)"
      borderRadius="lg"
      p={4}
      textAlign="center"
    >
      <Text fontSize="xs" color="var(--muted-text)">{label}</Text>
      <Text fontSize="xl" fontWeight="bold" color={color || 'var(--heading-color)'}>{value}</Text>
    </Box>
  );
}

export default RetirementPlanner;
