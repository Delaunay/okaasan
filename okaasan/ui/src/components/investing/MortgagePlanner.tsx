import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Flex, Heading, Text, VStack, HStack, Input, Button } from '@chakra-ui/react';
import { ArrowLeft, Save, Trash2, FolderOpen, Download } from 'lucide-react';
import { privateJsonStore } from '../../services/jsonstore';
import VegaPlot from '../health/VegaPlot';
import { VegaProvider } from '../../contexts/VegaContext';
import { exportMortgageExcel } from '../../utils/exportExcel';

interface MortgageInputs {
  homePrice: number;
  downPaymentPct: number;
  interestRate: number;
  amortizationYears: number;
  closingCostsPct: number;
  extraMonthlyPayment: number;
  propertyTaxAnnual: number;
  homeInsuranceAnnual: number;
  condoFeesMonthly: number;
  maintenancePct: number;
  utilitiesDelta: number;
  monthlyRent: number;
  rentersInsuranceAnnual: number;
  annualRentIncrease: number;
  inflationRate: number;
  investmentReturn: number;
  homeAppreciation: number;
  marginalTaxRate: number;
  timeHorizonYears: number;
}

const DEFAULTS: MortgageInputs = {
  homePrice: 500000,
  downPaymentPct: 20,
  interestRate: 3,
  amortizationYears: 25,
  closingCostsPct: 3,
  extraMonthlyPayment: 0,
  propertyTaxAnnual: 5000,
  homeInsuranceAnnual: 1000,
  condoFeesMonthly: 350,
  maintenancePct: 0.1,
  utilitiesDelta: 0,
  monthlyRent: 2200,
  rentersInsuranceAnnual: 0,
  annualRentIncrease: 3,
  inflationRate: 2.5,
  investmentReturn: 7,
  homeAppreciation: 3,
  marginalTaxRate: 30,
  timeHorizonYears: 35,
};

const COLLECTION = 'mortgage';

function computeMortgage(inputs: MortgageInputs) {
  const {
    homePrice, downPaymentPct, interestRate, amortizationYears,
    closingCostsPct, extraMonthlyPayment,
    propertyTaxAnnual, homeInsuranceAnnual, condoFeesMonthly, maintenancePct, utilitiesDelta,
    monthlyRent, rentersInsuranceAnnual, annualRentIncrease, inflationRate,
    investmentReturn, homeAppreciation, timeHorizonYears,
  } = inputs;

  const downPayment = homePrice * downPaymentPct / 100;
  const closingCosts = homePrice * closingCostsPct / 100;
  const principal = homePrice - downPayment;
  const monthlyRate = interestRate / 100 / 12;
  const totalPayments = amortizationYears * 12;

  const monthlyPI = monthlyRate > 0
    ? principal * monthlyRate * Math.pow(1 + monthlyRate, totalPayments) / (Math.pow(1 + monthlyRate, totalPayments) - 1)
    : principal / totalPayments;

  const amortization: { month: number; year: number; principal: number; interest: number; balance: number; equity: number; homeValue: number }[] = [];
  const yearlyCost: { year: number; type: string; amount: number }[] = [];
  const buyVsRent: {
    year: number; buyNetWorth: number; rentNetWorth: number;
    buyCumCost: number; rentCumCost: number;
    homeValue: number; mortgageBalance: number;
    buyInvestments: number;
    rentInitialInv: number; rentSavingsInv: number;
    buyCashflow: number; rentCashflow: number;
  }[] = [];

  let balance = principal;
  let buyInvestments = 0;
  let rentInitialInv = downPayment + closingCosts;
  let rentSavingsInv = 0;
  let buyCumCost = downPayment + closingCosts;
  let rentCumCost = 0;
  const monthlyInvReturn = investmentReturn / 100 / 12;

  buyVsRent.push({
    year: 0,
    buyNetWorth: homePrice - principal - closingCosts,
    rentNetWorth: rentInitialInv,
    buyCumCost, rentCumCost,
    homeValue: homePrice, mortgageBalance: balance,
    buyInvestments: 0,
    rentInitialInv, rentSavingsInv: 0,
    buyCashflow: 0, rentCashflow: 0,
  });

  for (let year = 1; year <= timeHorizonYears; year++) {
    const homeValue = homePrice * Math.pow(1 + homeAppreciation / 100, year);
    const inflFactor = Math.pow(1 + inflationRate / 100, year - 1);
    const currentRent = monthlyRent * Math.pow(1 + annualRentIncrease / 100, year - 1);
    const annualMaintenance = homeValue * maintenancePct / 100;

    const propTax = propertyTaxAnnual * inflFactor;
    const homeIns = homeInsuranceAnnual * inflFactor;
    const condoFees = condoFeesMonthly * inflFactor;
    const utilDelta = utilitiesDelta * inflFactor;
    const renterIns = rentersInsuranceAnnual * inflFactor;

    let yearInterest = 0;
    let yearPrincipal = 0;

    for (let m = 0; m < 12; m++) {
      let mortgagePayment = 0;
      if (balance > 0) {
        const intPayment = balance * monthlyRate;
        const prinPayment = Math.min(balance, monthlyPI - intPayment + extraMonthlyPayment);
        balance = Math.max(0, balance - prinPayment);
        mortgagePayment = intPayment + prinPayment;
        yearInterest += intPayment;
        yearPrincipal += prinPayment;
      }

      const ownershipFixed = propTax / 12
        + homeIns / 12
        + condoFees
        + annualMaintenance / 12
        + utilDelta;

      const buyCashflow = mortgagePayment + ownershipFixed;
      const rentCashflow = currentRent + renterIns / 12;

      buyCumCost += buyCashflow;
      rentCumCost += rentCashflow;

      const maxCashflow = Math.max(buyCashflow, rentCashflow);

      buyInvestments = buyInvestments * (1 + monthlyInvReturn) + (maxCashflow - buyCashflow);
      rentInitialInv = rentInitialInv * (1 + monthlyInvReturn);
      rentSavingsInv = rentSavingsInv * (1 + monthlyInvReturn) + (maxCashflow - rentCashflow);

      const month = (year - 1) * 12 + m + 1;
      amortization.push({
        month, year,
        principal: yearPrincipal > 0 ? prinPaymentForMonth() : 0,
        interest: balance > 0 ? balance * monthlyRate : 0,
        balance, equity: homeValue - balance, homeValue,
      });

      function prinPaymentForMonth() {
        if (balance <= 0) return 0;
        const ip = balance * monthlyRate;
        return Math.min(balance, monthlyPI - ip + extraMonthlyPayment);
      }
    }

    yearlyCost.push({ year, type: 'Mortgage P&I', amount: yearPrincipal + yearInterest });
    yearlyCost.push({ year, type: 'Property Tax', amount: propTax });
    yearlyCost.push({ year, type: 'Insurance', amount: homeIns });
    yearlyCost.push({ year, type: 'Condo/HOA', amount: condoFees * 12 });
    yearlyCost.push({ year, type: 'Maintenance', amount: annualMaintenance });

    const currentRentMonthly = currentRent + renterIns / 12;
    const mortgageMonthly = balance > 0 ? monthlyPI + extraMonthlyPayment : 0;
    const ownershipMonthly = mortgageMonthly + propTax / 12 + homeIns / 12 + condoFees + annualMaintenance / 12 + utilDelta;

    buyVsRent.push({
      year,
      buyNetWorth: homeValue - balance + buyInvestments,
      rentNetWorth: rentInitialInv + rentSavingsInv,
      buyCumCost, rentCumCost,
      homeValue, mortgageBalance: balance,
      buyInvestments,
      rentInitialInv, rentSavingsInv,
      buyCashflow: ownershipMonthly,
      rentCashflow: currentRentMonthly,
    });
  }

  const breakeven = buyVsRent.find(p => p.year > 0 && p.buyNetWorth >= p.rentNetWorth)?.year || null;

  return { monthlyPI, downPayment, closingCosts, amortization, yearlyCost, buyVsRent, breakeven };
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

const MortgagePlanner: React.FC = () => {
  const { scenario: urlScenario } = useParams<{ scenario: string }>();
  const navigate = useNavigate();
  const [inputs, setInputs] = useState<MortgageInputs>(DEFAULTS);
  const [scenarioName, setScenarioName] = useState(urlScenario || '');
  const [scenarios, setScenarios] = useState<string[]>([]);

  const set = useCallback(<K extends keyof MortgageInputs>(key: K, val: MortgageInputs[K]) => {
    setInputs(prev => ({ ...prev, [key]: val }));
  }, []);

  const loadScenarios = useCallback(async () => {
    try { setScenarios(await privateJsonStore.list(COLLECTION)); } catch { /* empty */ }
  }, []);

  useEffect(() => { loadScenarios(); }, [loadScenarios]);

  useEffect(() => {
    if (urlScenario) {
      privateJsonStore.get<MortgageInputs>(COLLECTION, urlScenario)
        .then(data => { setInputs(data); setScenarioName(urlScenario); })
        .catch(() => {});
    }
  }, [urlScenario]);

  const handleSave = async () => {
    const name = scenarioName.trim();
    if (!name) return;
    await privateJsonStore.put(COLLECTION, name, inputs);
    await loadScenarios();
    navigate(`/investing/mortgage/${encodeURIComponent(name)}`, { replace: true });
  };

  const handleDelete = async () => {
    const name = scenarioName.trim();
    if (!name) return;
    await privateJsonStore.remove(COLLECTION, name);
    setScenarioName('');
    setInputs(DEFAULTS);
    await loadScenarios();
    navigate('/investing/mortgage', { replace: true });
  };

  const result = useMemo(() => computeMortgage(inputs), [inputs]);
  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  const buyVsRentSpec = useMemo(() => {
    const values = result.buyVsRent.flatMap(p => [
      { year: p.year, netWorth: p.buyNetWorth, strategy: 'Buy' },
      { year: p.year, netWorth: p.rentNetWorth, strategy: 'Rent & Invest' },
    ]);
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 300,
      title: { text: 'Buy vs. Rent: Net Worth', anchor: 'middle' as const, offset: 12 },
      data: { values },
      mark: { type: 'line', interpolate: 'monotone', strokeWidth: 2 },
      encoding: {
        x: { field: 'year', type: 'quantitative', title: 'Year' },
        y: { field: 'netWorth', type: 'quantitative', title: 'Net Worth ($)', axis: { format: '~s', titlePadding: 16 } },
        color: {
          field: 'strategy', type: 'nominal',
          scale: { domain: ['Buy', 'Rent & Invest'], range: ['#3b82f6', '#f59e0b'] },
          legend: { title: null },
        },
        tooltip: [
          { field: 'year', type: 'quantitative', title: 'Year' },
          { field: 'strategy', type: 'nominal', title: 'Strategy' },
          { field: 'netWorth', type: 'quantitative', title: 'Net Worth', format: '$,.0f' },
        ],
      },
    };
  }, [result.buyVsRent]);

  const sharedYMax = useMemo(() => {
    let max = 0;
    for (const p of result.buyVsRent) {
      const buyTotal = (p.homeValue - p.mortgageBalance) + p.buyInvestments;
      const rentTotal = p.rentInitialInv + p.rentSavingsInv;
      max = Math.max(max, buyTotal, rentTotal);
    }
    return max * 1.05;
  }, [result.buyVsRent]);

  const buyBreakdownSpec = useMemo(() => {
    const values = result.buyVsRent.flatMap(p => [
      { year: p.year, amount: p.homeValue - p.mortgageBalance, component: 'Home Equity' },
      { year: p.year, amount: p.buyInvestments, component: 'Investments' },
    ]);
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 220,
      title: { text: 'Buy: Net Worth Breakdown (stacked)', anchor: 'middle' as const, offset: 12 },
      data: { values },
      mark: { type: 'area', interpolate: 'monotone', opacity: 0.7, line: { strokeWidth: 2 } },
      encoding: {
        x: { field: 'year', type: 'quantitative', title: 'Year' },
        y: { field: 'amount', type: 'quantitative', title: 'Net Worth ($)', axis: { format: '~s', titlePadding: 16 }, stack: true, scale: { domain: [0, sharedYMax] } },
        color: {
          field: 'component', type: 'nominal',
          scale: {
            domain: ['Home Equity', 'Investments'],
            range: ['#3b82f6', '#f59e0b'],
          },
          legend: { title: null },
        },
        order: { field: 'component', sort: 'descending' },
        tooltip: [
          { field: 'year', type: 'quantitative', title: 'Year' },
          { field: 'component', type: 'nominal', title: 'Component' },
          { field: 'amount', type: 'quantitative', title: 'Amount', format: '$,.0f' },
        ],
      },
    };
  }, [result.buyVsRent, sharedYMax]);

  const rentBreakdownSpec = useMemo(() => {
    const values = result.buyVsRent.flatMap(p => [
      { year: p.year, amount: p.rentInitialInv, component: 'Initial Investment' },
      { year: p.year, amount: p.rentSavingsInv, component: 'Cashflow Savings' },
    ]);
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 220,
      title: { text: 'Rent: Net Worth Breakdown (stacked)', anchor: 'middle' as const, offset: 12 },
      data: { values },
      mark: { type: 'area', interpolate: 'monotone', opacity: 0.7, line: { strokeWidth: 2 } },
      encoding: {
        x: { field: 'year', type: 'quantitative', title: 'Year' },
        y: { field: 'amount', type: 'quantitative', title: 'Net Worth ($)', axis: { format: '~s', titlePadding: 16 }, stack: true, scale: { domain: [0, sharedYMax] } },
        color: {
          field: 'component', type: 'nominal',
          scale: {
            domain: ['Initial Investment', 'Cashflow Savings'],
            range: ['#3b82f6', '#f59e0b'],
          },
          legend: { title: null },
        },
        order: { field: 'component', sort: 'descending' },
        tooltip: [
          { field: 'year', type: 'quantitative', title: 'Year' },
          { field: 'component', type: 'nominal', title: 'Component' },
          { field: 'amount', type: 'quantitative', title: 'Amount', format: '$,.0f' },
        ],
      },
    };
  }, [result.buyVsRent, sharedYMax]);

  const costComparisonSpec = useMemo(() => {
    const values = result.buyVsRent.filter(p => p.year > 0).flatMap(p => [
      { year: p.year, cost: p.buyCumCost, type: 'Buy (cumulative)' },
      { year: p.year, cost: p.rentCumCost, type: 'Rent (cumulative)' },
    ]);
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 220,
      title: { text: 'Cumulative Cost: Ownership vs. Renting', anchor: 'start' as const },
      data: { values },
      mark: { type: 'line', interpolate: 'monotone', strokeWidth: 2 },
      encoding: {
        x: { field: 'year', type: 'quantitative', title: 'Year' },
        y: { field: 'cost', type: 'quantitative', title: 'Cumulative Cost ($)', axis: { format: '~s', titlePadding: 16 } },
        color: {
          field: 'type', type: 'nominal',
          scale: { domain: ['Buy (cumulative)', 'Rent (cumulative)'], range: ['#3b82f6', '#f59e0b'] },
          legend: { title: null },
        },
        tooltip: [
          { field: 'year', type: 'quantitative', title: 'Year' },
          { field: 'type', type: 'nominal', title: 'Type' },
          { field: 'cost', type: 'quantitative', title: 'Cost', format: '$,.0f' },
        ],
      },
    };
  }, [result.buyVsRent]);

  const amortizationSpec = useMemo(() => {
    const yearly = result.amortization.filter((_, i) => i % 12 === 11 || i === result.amortization.length - 1);
    const values = yearly.flatMap(p => [
      { year: p.year, amount: p.balance, type: 'Remaining Balance' },
      { year: p.year, amount: p.equity, type: 'Equity' },
    ]);
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 220,
      title: { text: 'Equity Buildup & Mortgage Balance', anchor: 'start' as const },
      data: { values },
      mark: { type: 'area', interpolate: 'monotone', opacity: 0.6 },
      encoding: {
        x: { field: 'year', type: 'quantitative', title: 'Year' },
        y: { field: 'amount', type: 'quantitative', title: 'Amount ($)', axis: { format: '~s', titlePadding: 16 }, stack: null },
        color: {
          field: 'type', type: 'nominal',
          scale: { domain: ['Equity', 'Remaining Balance'], range: ['#22c55e', '#ef4444'] },
          legend: { title: null },
        },
        tooltip: [
          { field: 'year', type: 'quantitative', title: 'Year' },
          { field: 'type', type: 'nominal', title: 'Type' },
          { field: 'amount', type: 'quantitative', title: 'Amount', format: '$,.0f' },
        ],
      },
    };
  }, [result.amortization]);

  const pieSpec = (title: string, values: { type: string; amount: number }[]) => ({
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 'container' as const,
    height: 200,
    title: { text: title, anchor: 'middle' as const, offset: 12 },
    data: { values },
    mark: { type: 'arc', innerRadius: 50, tooltip: true },
    encoding: {
      theta: { field: 'amount', type: 'quantitative' },
      color: {
        field: 'type', type: 'nominal',
        scale: { scheme: 'tableau10' },
        legend: { title: null },
      },
      tooltip: [
        { field: 'type', type: 'nominal', title: 'Category' },
        { field: 'amount', type: 'quantitative', title: 'Annual Cost', format: '$,.0f' },
      ],
    },
  });

  const buyPieYear1 = useMemo(() => {
    const vals = result.yearlyCost.filter(c => c.year === 1);
    return vals.length ? pieSpec('Buy — Year 1 Costs', vals) : null;
  }, [result.yearlyCost]);

  const buyPieYear2 = useMemo(() => {
    const vals = result.yearlyCost.filter(c => c.year === 2);
    return vals.length ? pieSpec('Buy — Year 2 Costs', vals) : null;
  }, [result.yearlyCost]);

  const buyPiePaidOff = useMemo(() => {
    const paidOffEntry = result.buyVsRent.find(p => p.year > 0 && p.mortgageBalance === 0);
    if (!paidOffEntry) return null;
    const yr = paidOffEntry.year;
    const vals = result.yearlyCost
      .filter(c => c.year === yr && c.type !== 'Mortgage P&I' && c.amount > 0);
    if (!vals.length) return null;
    return pieSpec(`Buy — Year ${yr} (No Mortgage)`, vals);
  }, [result.yearlyCost, result.buyVsRent]);

  const rentPieYear1 = useMemo(() => {
    const rent = inputs.monthlyRent * 12;
    const insurance = inputs.rentersInsuranceAnnual;
    if (rent <= 0 && insurance <= 0) return null;
    const vals = [
      { type: 'Rent', amount: rent },
      { type: 'Renter\'s Insurance', amount: insurance },
    ].filter(v => v.amount > 0);
    return pieSpec('Rent — Year 1 Costs', vals);
  }, [inputs.monthlyRent, inputs.rentersInsuranceAnnual]);

  const cashflowSavingsSpec = useMemo(() => {
    const values = result.buyVsRent.filter(p => p.year > 0).map(p => ({
      year: p.year,
      saving: p.buyCashflow - p.rentCashflow,
    }));
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width: 'container' as const,
      height: 220,
      title: { text: 'Monthly Cashflow Saving (Buy − Rent)', anchor: 'middle' as const, offset: 12 },
      data: { values },
      layer: [
        {
          mark: { type: 'area', interpolate: 'monotone', opacity: 0.15 },
          encoding: {
            x: { field: 'year', type: 'quantitative', title: 'Year' },
            y: { field: 'saving', type: 'quantitative', title: 'Monthly Saving ($)', axis: { format: '~s', titlePadding: 16 } },
            color: {
              condition: { test: 'datum.saving >= 0', value: '#22c55e' },
              value: '#ef4444',
            },
          },
        },
        {
          mark: { type: 'line', interpolate: 'monotone', strokeWidth: 2 },
          encoding: {
            x: { field: 'year', type: 'quantitative' },
            y: { field: 'saving', type: 'quantitative' },
            color: {
              condition: { test: 'datum.saving >= 0', value: '#22c55e' },
              value: '#ef4444',
            },
          },
        },
        {
          mark: 'rule',
          encoding: {
            y: { datum: 0 },
            color: { value: 'var(--muted-text, #888)' },
            strokeDash: { value: [4, 4] },
          },
        },
      ],
      encoding: {
        tooltip: [
          { field: 'year', type: 'quantitative', title: 'Year' },
          { field: 'saving', type: 'quantitative', title: 'Rent saves $/mo', format: '$,.0f' },
        ],
      },
    };
  }, [result.buyVsRent]);

  const handleExport = useCallback(() => {
    exportMortgageExcel(inputs, result.buyVsRent, scenarioName);
  }, [inputs, result.buyVsRent, scenarioName]);

  return (
    <VStack align="stretch" gap={6} p={0}>
      <HStack gap={3}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/investing')}>
          <ArrowLeft size={16} />
        </Button>
        <Heading size="xl" color="var(--heading-color)">Mortgage Planner</Heading>
        <Button size="sm" variant="outline" onClick={handleExport} ml="auto">
          <Download size={14} /> Export Excel
        </Button>
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
            onClick={() => navigate(`/investing/mortgage/${encodeURIComponent(s)}`)}
          >
            <FolderOpen size={12} /> {s}
          </Button>
        ))}
      </HStack>

      {/* Inputs */}
      <Flex gap={4} flexWrap="wrap">
        <Box flex="1 1 260px" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" p={4}>
          <Heading size="sm" mb={3} color="var(--heading-color)">Property</Heading>
          <VStack align="stretch" gap={3}>
            <Field label="Home Price" suffix="$" value={inputs.homePrice} onChange={v => set('homePrice', v)} />
            <Field label="Down Payment" suffix="%" value={inputs.downPaymentPct} onChange={v => set('downPaymentPct', v)} />
            <Field label="Interest Rate" suffix="%" value={inputs.interestRate} onChange={v => set('interestRate', v)} />
            <Field label="Amortization" suffix="years" value={inputs.amortizationYears} onChange={v => set('amortizationYears', v)} />
            <Field label="Closing Costs" suffix="%" value={inputs.closingCostsPct} onChange={v => set('closingCostsPct', v)} />
            <Field label="Extra Monthly Payment" suffix="$/mo" value={inputs.extraMonthlyPayment} onChange={v => set('extraMonthlyPayment', v)} />
          </VStack>
        </Box>
        <Box flex="1 1 260px" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" p={4}>
          <Heading size="sm" mb={3} color="var(--heading-color)">Ownership Costs</Heading>
          <VStack align="stretch" gap={3}>
            <Field label="Property Tax" suffix="$/yr" value={inputs.propertyTaxAnnual} onChange={v => set('propertyTaxAnnual', v)} />
            <Field label="Home Insurance" suffix="$/yr" value={inputs.homeInsuranceAnnual} onChange={v => set('homeInsuranceAnnual', v)} />
            <Field label="Condo / HOA Fees" suffix="$/mo" value={inputs.condoFeesMonthly} onChange={v => set('condoFeesMonthly', v)} />
            <Field label="Maintenance" suffix="% of value/yr" value={inputs.maintenancePct} onChange={v => set('maintenancePct', v)} />
            <Field label="Utilities Delta vs Rent" suffix="$/mo" value={inputs.utilitiesDelta} onChange={v => set('utilitiesDelta', v)} />
          </VStack>
        </Box>
        <Box flex="1 1 260px" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" p={4}>
          <Heading size="sm" mb={3} color="var(--heading-color)">Rental Alternative</Heading>
          <VStack align="stretch" gap={3}>
            <Field label="Monthly Rent" suffix="$/mo" value={inputs.monthlyRent} onChange={v => set('monthlyRent', v)} />
            <Field label="Renter's Insurance" suffix="$/yr" value={inputs.rentersInsuranceAnnual} onChange={v => set('rentersInsuranceAnnual', v)} />
            <Field label="Annual Rent Increase" suffix="%" value={inputs.annualRentIncrease} onChange={v => set('annualRentIncrease', v)} />
          </VStack>
          <Heading size="sm" mt={5} mb={3} color="var(--heading-color)">Assumptions</Heading>
          <VStack align="stretch" gap={3}>
            <Field label="Inflation Rate" suffix="%" value={inputs.inflationRate} onChange={v => set('inflationRate', v)} />
            <Field label="Investment Return" suffix="%" value={inputs.investmentReturn} onChange={v => set('investmentReturn', v)} />
            <Field label="Home Appreciation" suffix="%" value={inputs.homeAppreciation} onChange={v => set('homeAppreciation', v)} />
            <Field label="Marginal Tax Rate" suffix="%" value={inputs.marginalTaxRate} onChange={v => set('marginalTaxRate', v)} />
            <Field label="Time Horizon" suffix="years" value={inputs.timeHorizonYears} onChange={v => set('timeHorizonYears', v)} />
          </VStack>
        </Box>
      </Flex>

      {/* Summary */}
      <Flex gap={4} flexWrap="wrap">
        <SummaryCard label="Down Payment" value={fmt(result.downPayment)} />
        <SummaryCard label="Closing Costs" value={fmt(result.closingCosts)} />
        {result.breakeven !== null ? (
          <SummaryCard label="Buy Breakeven" value={`Year ${result.breakeven}`} color="var(--panel-green-text, #22c55e)" />
        ) : (
          <SummaryCard label="Buy Breakeven" value="Never (in horizon)" color="var(--panel-red-text, #ef4444)" />
        )}
      </Flex>

      {/* Monthly cost comparison — Buy left, Rent right */}
      <Flex gap={4} flexWrap="wrap">
        <Box flex="1 1 300px" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" p={4}>
          <Heading size="sm" mb={3} color="var(--heading-color)">Buy — One-Time Costs</Heading>
          <CostLine label="Down Payment" value={result.downPayment} />
          <CostLine label="Closing Costs" value={result.closingCosts} />
          <Box borderTop="2px solid var(--border-color)" mt={2} pt={2}>
            <CostLine label="Total Upfront" value={result.downPayment + result.closingCosts} bold />
          </Box>

          <Heading size="sm" mt={5} mb={3} color="var(--heading-color)">Buy — Monthly (Mortgage)</Heading>
          <CostLine label="Mortgage P&I" value={result.monthlyPI} />
          <CostLine label="Extra Payment" value={inputs.extraMonthlyPayment} />
          <Box borderTop="1px solid var(--border-color)" mt={2} pt={2}>
            <CostLine label="Subtotal Mortgage" value={result.monthlyPI + inputs.extraMonthlyPayment} bold />
          </Box>

          <Heading size="sm" mt={5} mb={3} color="var(--heading-color)">Buy — Monthly (Ownership)</Heading>
          <CostLine label="Property Tax" value={inputs.propertyTaxAnnual / 12} />
          <CostLine label="Home Insurance" value={inputs.homeInsuranceAnnual / 12} />
          <CostLine label="Condo / HOA" value={inputs.condoFeesMonthly} />
          <CostLine label="Maintenance" value={inputs.homePrice * inputs.maintenancePct / 100 / 12} />
          <CostLine label="Utilities Delta" value={inputs.utilitiesDelta} />
          <Box borderTop="1px solid var(--border-color)" mt={2} pt={2}>
            <CostLine label="Subtotal Ownership" value={
              inputs.propertyTaxAnnual / 12 + inputs.homeInsuranceAnnual / 12
              + inputs.condoFeesMonthly + inputs.homePrice * inputs.maintenancePct / 100 / 12
              + inputs.utilitiesDelta
            } bold />
          </Box>

          <Box borderTop="2px solid var(--border-color)" mt={3} pt={3}>
            <CostLine label="Total Monthly (Buy)" value={
              result.monthlyPI + inputs.extraMonthlyPayment
              + inputs.propertyTaxAnnual / 12 + inputs.homeInsuranceAnnual / 12
              + inputs.condoFeesMonthly + inputs.homePrice * inputs.maintenancePct / 100 / 12
              + inputs.utilitiesDelta
            } bold />
            <Text fontSize="2xs" color="var(--muted-text)" mt={1}>
              After mortgage ends, monthly drops to ownership costs only.
              Freed cashflow gets invested at {inputs.investmentReturn}%.
            </Text>
          </Box>
        </Box>

        <Box flex="1 1 300px" bg="var(--card-bg)" border="1px solid" borderColor="var(--border-color)" borderRadius="lg" p={4}>
          <Heading size="sm" mb={3} color="var(--heading-color)">Rent — One-Time Costs</Heading>
          <Text fontSize="sm" color="var(--muted-text)" py={2}>None — down payment + closing costs invested instead</Text>
          <CostLine label="Invested" value={result.downPayment + result.closingCosts} />

          <Heading size="sm" mt={5} mb={3} color="var(--heading-color)">Rent — Monthly</Heading>
          <CostLine label="Rent" value={inputs.monthlyRent} />
          <CostLine label="Renter's Insurance" value={inputs.rentersInsuranceAnnual / 12} />
          <Box borderTop="2px solid var(--border-color)" mt={2} pt={2}>
            <CostLine label="Total Monthly (Rent)" value={inputs.monthlyRent + inputs.rentersInsuranceAnnual / 12} bold />
            <Text fontSize="2xs" color="var(--muted-text)" mt={1}>
              Increases {inputs.annualRentIncrease}% per year
            </Text>
          </Box>

        </Box>
      </Flex>

      {/* Charts */}
      <VegaProvider><VegaPlot spec={buyVsRentSpec} height="320px" /></VegaProvider>

      <Flex gap={4} flexWrap="wrap">
        <Box flex="1 1 0" minW="300px">
          <VegaProvider><VegaPlot spec={buyBreakdownSpec} height="260px" /></VegaProvider>
        </Box>
        <Box flex="1 1 0" minW="300px">
          <VegaProvider><VegaPlot spec={rentBreakdownSpec} height="260px" /></VegaProvider>
        </Box>
      </Flex>

      <Flex gap={4} flexWrap="wrap">
        <Box flex="1 1 0" minW="300px">
          <VegaProvider><VegaPlot spec={costComparisonSpec} height="260px" /></VegaProvider>
        </Box>
        <Box flex="1 1 0" minW="300px">
          <VegaProvider><VegaPlot spec={amortizationSpec} height="260px" /></VegaProvider>
        </Box>
      </Flex>

      <Flex gap={4} flexWrap="wrap">
        {buyPieYear1 && (
          <Box flex="1 1 0" minW="250px">
            <VegaProvider><VegaPlot spec={buyPieYear1} height="260px" /></VegaProvider>
          </Box>
        )}
        {buyPieYear2 && (
          <Box flex="1 1 0" minW="250px">
            <VegaProvider><VegaPlot spec={buyPieYear2} height="260px" /></VegaProvider>
          </Box>
        )}
        {buyPiePaidOff && (
          <Box flex="1 1 0" minW="250px">
            <VegaProvider><VegaPlot spec={buyPiePaidOff} height="260px" /></VegaProvider>
          </Box>
        )}
        {rentPieYear1 && (
          <Box flex="1 1 0" minW="250px">
            <VegaProvider><VegaPlot spec={rentPieYear1} height="260px" /></VegaProvider>
          </Box>
        )}
      </Flex>

      <VegaProvider><VegaPlot spec={cashflowSavingsSpec} height="280px" /></VegaProvider>

      {/* Buy vs Rent spreadsheet */}
      <Box>
        <Heading size="sm" color="var(--heading-color)" mb={3}>Buy vs. Rent — Year by Year</Heading>
        <Box overflowX="auto" border="1px solid" borderColor="var(--border-color)" borderRadius="lg">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', background: 'var(--card-bg)' }}>
                <Th>Yr</Th>
                <Th align="right">Buy $/mo</Th>
                <Th align="right">Rent $/mo</Th>
                <Th align="right">Home Value</Th>
                <Th align="right">Mortgage</Th>
                <Th align="right">Buy Invest.</Th>
                <Th align="right">Buy NW</Th>
                <Th align="right">Rent NW</Th>
                <Th align="right">Advantage</Th>
              </tr>
            </thead>
            <tbody>
              {result.buyVsRent.map(p => {
                const adv = p.buyNetWorth - p.rentNetWorth;
                return (
                  <tr key={p.year} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <Td>{p.year}</Td>
                    <Td align="right">{p.year > 0 ? fmt(p.buyCashflow) : '—'}</Td>
                    <Td align="right">{p.year > 0 ? fmt(p.rentCashflow) : '—'}</Td>
                    <Td align="right">{fmt(p.homeValue)}</Td>
                    <Td align="right">{fmt(p.mortgageBalance)}</Td>
                    <Td align="right">{fmt(p.buyInvestments)}</Td>
                    <Td align="right">{fmt(p.buyNetWorth)}</Td>
                    <Td align="right">{fmt(p.rentNetWorth)}</Td>
                    <Td align="right" style={{ color: adv >= 0 ? 'var(--panel-green-text, #22c55e)' : 'var(--panel-red-text, #ef4444)', fontWeight: 600 }}>
                      {adv >= 0 ? '+' : ''}{fmt(adv)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
      </Box>
    </VStack>
  );
};

function Th({ children, align }: { children: React.ReactNode; align?: string }) {
  return (
    <th style={{
      padding: '8px 12px',
      textAlign: (align as any) || 'left',
      fontWeight: 700,
      color: 'var(--heading-color)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  );
}

function Td({ children, align, style }: { children: React.ReactNode; align?: string; style?: React.CSSProperties }) {
  return (
    <td style={{
      padding: '6px 12px',
      textAlign: (align as any) || 'left',
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {children}
    </td>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box
      flex="1 1 140px"
      bg="var(--card-bg)"
      border="1px solid"
      borderColor="var(--border-color)"
      borderRadius="lg"
      p={3}
      textAlign="center"
    >
      <Text fontSize="xs" color="var(--muted-text)">{label}</Text>
      <Text fontSize="lg" fontWeight="bold" color={color || 'var(--heading-color)'}>{value}</Text>
    </Box>
  );
}

function CostLine({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  const f = value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return (
    <HStack justify="space-between" py={1}>
      <Text fontSize="sm" fontWeight={bold ? 'bold' : 'normal'} color={bold ? 'var(--heading-color)' : undefined}>{label}</Text>
      <Text fontSize="sm" fontWeight={bold ? 'bold' : 'semibold'} color={bold ? 'var(--heading-color)' : undefined}>{f}</Text>
    </HStack>
  );
}

export default MortgagePlanner;
