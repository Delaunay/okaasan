import ExcelJS from 'exceljs';

function saveWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  workbook.xlsx.writeBuffer().then(buffer => {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}

const USD = '#,##0';
const PCT = '0.0%';

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  row.alignment = { horizontal: 'center' };
}

export function exportRetirementExcel(
  inputs: {
    currentAge: number; retirementAge: number; lifeExpectancy: number;
    currentSavings: number; monthlyContribution: number; annualReturn: number;
    retirementReturn: number; inflationRate: number; desiredAnnualIncome: number;
    monthlyPension: number; employerMatchPct: number; employerMatchCap: number;
  },
  scenarioName: string,
) {
  const wb = new ExcelJS.Workbook();

  const params = wb.addWorksheet('Parameters');
  params.columns = [{ width: 25 }, { width: 18 }];
  const paramRows: [string, number | string][] = [
    ['Current Age', inputs.currentAge],
    ['Retirement Age', inputs.retirementAge],
    ['Life Expectancy', inputs.lifeExpectancy],
    ['Current Savings', inputs.currentSavings],
    ['Monthly Contribution', inputs.monthlyContribution],
    ['Growth Return', inputs.annualReturn / 100],
    ['Retirement Return', inputs.retirementReturn / 100],
    ['Inflation Rate', inputs.inflationRate / 100],
    ['Desired Annual Income', inputs.desiredAnnualIncome],
    ['Monthly Pension', inputs.monthlyPension],
    ['Employer Match %', inputs.employerMatchPct / 100],
    ['Employer Match Cap', inputs.employerMatchCap],
  ];
  paramRows.forEach(([label, val], i) => {
    const r = params.getRow(i + 1);
    r.getCell(1).value = label;
    r.getCell(1).font = { bold: true };
    r.getCell(2).value = val;
    if (typeof val === 'number' && val < 1 && val > 0) r.getCell(2).numFmt = PCT;
    else if (typeof val === 'number' && val >= 1000) r.getCell(2).numFmt = USD;
  });

  const ws = wb.addWorksheet('Projection');

  const headers = ['Age', 'Phase', 'Start Balance', 'Contributions', 'Employer Match',
    'Investment Return', 'Growth', 'Pension Income', 'Withdrawal', 'End Balance'];
  const hRow = ws.addRow(headers);
  styleHeader(hRow);

  // Column refs: A=Age, B=Phase, C=Start, D=Contrib, E=Employer, F=ReturnRate, G=Growth, H=Pension, I=Withdrawal, J=End
  ws.columns = [
    { width: 6 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 14 },
    { width: 12 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 },
  ];

  const retAge = inputs.retirementAge;
  const startAge = inputs.currentAge;
  const endAge = inputs.lifeExpectancy;
  const monthlyContrib = inputs.monthlyContribution;
  const employerMatch = Math.min(monthlyContrib * inputs.employerMatchPct / 100, inputs.employerMatchCap);
  const growthRate = inputs.annualReturn / 100;
  const retRate = inputs.retirementReturn / 100;
  const inflRate = inputs.inflationRate / 100;
  const monthlyPension = inputs.monthlyPension;
  const desiredIncome = inputs.desiredAnnualIncome;

  let savings = inputs.currentSavings;
  let totalContribs = inputs.currentSavings;
  let totalEmployer = 0;

  for (let age = startAge; age <= endAge; age++) {
    const r = age - startAge + 2; // Excel row (1-indexed, +1 for header)
    const isAccum = age < retAge;
    const phase = isAccum ? 'Accumulation' : 'Drawdown';
    const rate = isAccum ? growthRate : retRate;

    const startBalance = savings;
    let yearContrib = 0;
    let yearEmployer = 0;
    let yearWithdrawal = 0;
    let yearPension = 0;

    if (isAccum) {
      for (let m = 0; m < 12; m++) {
        savings = savings * (1 + rate / 12) + monthlyContrib + employerMatch;
        totalContribs += monthlyContrib;
        totalEmployer += employerMatch;
        yearContrib += monthlyContrib;
        yearEmployer += employerMatch;
      }
    } else {
      const yrsIn = age - retAge;
      const inflFactor = Math.pow(1 + inflRate, yrsIn);
      const adjIncome = desiredIncome * inflFactor;
      const adjPension = monthlyPension * 12 * inflFactor;
      yearPension = adjPension;
      yearWithdrawal = Math.max(0, adjIncome - adjPension);
      for (let m = 0; m < 12; m++) {
        savings = savings * (1 + rate / 12) - yearWithdrawal / 12;
      }
    }

    const yearGrowth = savings - startBalance - yearContrib - yearEmployer + yearWithdrawal;

    const row = ws.addRow([
      age,
      phase,
      startBalance,
      yearContrib || '',
      yearEmployer || '',
      rate,
      yearGrowth,
      yearPension || '',
      yearWithdrawal || '',
      Math.max(0, savings),
    ]);

    // Apply formats
    row.getCell(3).numFmt = USD;  // Start Balance
    if (yearContrib) row.getCell(4).numFmt = USD;
    if (yearEmployer) row.getCell(5).numFmt = USD;
    row.getCell(6).numFmt = PCT;  // Return rate
    row.getCell(7).numFmt = USD;  // Growth
    if (yearPension) row.getCell(8).numFmt = USD;
    if (yearWithdrawal) row.getCell(9).numFmt = USD;
    row.getCell(10).numFmt = USD; // End Balance

    // Color growth
    if (yearGrowth < 0) row.getCell(7).font = { color: { argb: 'FFEF4444' } };
    else row.getCell(7).font = { color: { argb: 'FF22C55E' } };

    // Color withdrawal
    if (yearWithdrawal > 0) row.getCell(9).font = { color: { argb: 'FFEF4444' } };

    // Highlight retirement year
    if (age === retAge) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
    }

    // Add formula for End Balance validation: =C{r}+D{r}+E{r}+G{r}-I{r}
    row.getCell(10).value = { formula: `C${r}+D${r}+E${r}+G${r}-I${r}` } as any;
    row.getCell(10).numFmt = USD;
  }

  ws.autoFilter = { from: 'A1', to: `J${endAge - startAge + 2}` };

  saveWorkbook(wb, `retirement-${scenarioName || 'plan'}.xlsx`);
}

export function exportMortgageExcel(
  inputs: {
    homePrice: number; downPaymentPct: number; interestRate: number;
    amortizationYears: number; closingCostsPct: number; extraMonthlyPayment: number;
    propertyTaxAnnual: number; homeInsuranceAnnual: number; condoFeesMonthly: number;
    maintenancePct: number; utilitiesDelta: number; monthlyRent: number;
    rentersInsuranceAnnual: number; annualRentIncrease: number; inflationRate: number;
    investmentReturn: number; homeAppreciation: number; marginalTaxRate: number;
    timeHorizonYears: number;
  },
  buyVsRent: {
    year: number; buyNetWorth: number; rentNetWorth: number;
    buyCumCost: number; rentCumCost: number;
    homeValue: number; mortgageBalance: number;
    buyInvestments: number; rentInitialInv: number; rentSavingsInv: number;
    buyCashflow: number; rentCashflow: number;
  }[],
  scenarioName: string,
) {
  const wb = new ExcelJS.Workbook();

  const params = wb.addWorksheet('Parameters');
  params.columns = [{ width: 25 }, { width: 18 }];
  const paramRows: [string, number | string][] = [
    ['Home Price', inputs.homePrice],
    ['Down Payment %', inputs.downPaymentPct / 100],
    ['Interest Rate', inputs.interestRate / 100],
    ['Amortization (years)', inputs.amortizationYears],
    ['Closing Costs %', inputs.closingCostsPct / 100],
    ['Extra Monthly Payment', inputs.extraMonthlyPayment],
    ['Property Tax (annual)', inputs.propertyTaxAnnual],
    ['Home Insurance (annual)', inputs.homeInsuranceAnnual],
    ['Condo/HOA (monthly)', inputs.condoFeesMonthly],
    ['Maintenance %', inputs.maintenancePct / 100],
    ['Utilities Delta', inputs.utilitiesDelta],
    ['Monthly Rent', inputs.monthlyRent],
    ['Renter\'s Insurance (annual)', inputs.rentersInsuranceAnnual],
    ['Annual Rent Increase', inputs.annualRentIncrease / 100],
    ['Inflation Rate', inputs.inflationRate / 100],
    ['Investment Return', inputs.investmentReturn / 100],
    ['Home Appreciation', inputs.homeAppreciation / 100],
    ['Marginal Tax Rate', inputs.marginalTaxRate / 100],
    ['Time Horizon (years)', inputs.timeHorizonYears],
  ];
  paramRows.forEach(([label, val], i) => {
    const r = params.getRow(i + 1);
    r.getCell(1).value = label;
    r.getCell(1).font = { bold: true };
    r.getCell(2).value = val;
    if (typeof val === 'number' && val < 1 && val > 0) r.getCell(2).numFmt = PCT;
    else if (typeof val === 'number' && val >= 100) r.getCell(2).numFmt = USD;
  });

  const ws = wb.addWorksheet('Buy vs Rent');

  const headers = [
    'Year', 'Buy $/mo', 'Rent $/mo',
    'Home Value', 'Mortgage Balance', 'Buy Investments', 'Buy Net Worth',
    'Rent Initial Inv', 'Rent Savings Inv', 'Rent Net Worth',
    'Buy Cum. Cost', 'Rent Cum. Cost', 'Advantage',
  ];
  const hRow = ws.addRow(headers);
  styleHeader(hRow);

  ws.columns = [
    { width: 6 }, { width: 12 }, { width: 12 },
    { width: 14 }, { width: 16 }, { width: 14 }, { width: 14 },
    { width: 14 }, { width: 14 }, { width: 14 },
    { width: 14 }, { width: 14 }, { width: 14 },
  ];

  // A=Year, B=Buy$/mo, C=Rent$/mo, D=HomeVal, E=MortBal, F=BuyInv, G=BuyNW
  // H=RentInitInv, I=RentSavInv, J=RentNW, K=BuyCum, L=RentCum, M=Advantage

  buyVsRent.forEach((p, i) => {
    const r = i + 2;
    const row = ws.addRow([
      p.year,
      p.year > 0 ? p.buyCashflow : '',
      p.year > 0 ? p.rentCashflow : '',
      p.homeValue,
      p.mortgageBalance,
      p.buyInvestments,
      p.buyNetWorth,
      p.rentInitialInv,
      p.rentSavingsInv,
      p.rentNetWorth,
      p.buyCumCost,
      p.rentCumCost,
      null,
    ]);

    // Advantage formula: =G{r}-J{r}
    row.getCell(13).value = { formula: `G${r}-J${r}` } as any;

    // Buy Net Worth formula: =D{r}-E{r}+F{r}
    row.getCell(7).value = { formula: `D${r}-E${r}+F${r}` } as any;

    // Rent Net Worth formula: =H{r}+I{r}
    row.getCell(10).value = { formula: `H${r}+I${r}` } as any;

    for (let c = 2; c <= 13; c++) {
      const cell = row.getCell(c);
      if (cell.value !== '' && cell.value !== null) cell.numFmt = USD;
    }

    // Color advantage
    const adv = p.buyNetWorth - p.rentNetWorth;
    row.getCell(13).font = { color: { argb: adv >= 0 ? 'FF22C55E' : 'FFEF4444' }, bold: true };

    // Highlight when mortgage is paid off
    if (p.mortgageBalance === 0 && i > 0 && buyVsRent[i - 1]?.mortgageBalance > 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    }
  });

  ws.autoFilter = { from: 'A1', to: `M${buyVsRent.length + 1}` };

  saveWorkbook(wb, `mortgage-${scenarioName || 'plan'}.xlsx`);
}
