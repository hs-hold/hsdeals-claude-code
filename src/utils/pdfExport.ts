import jsPDF from 'jspdf';
import { Deal, DealApiData, DealFinancials } from '@/types/deal';
import { formatCurrency, formatPercent, getEffectiveMonthlyInsurance } from '@/utils/financialCalculations';

interface ExportData {
  deal: Deal;
  apiData: DealApiData;
  financials: DealFinancials;
  localOverrides: Record<string, string>;
  arv: number;
  rehabCost: number;
  rent: number;
  purchasePrice: number;
}

type AnalysisType = 'full' | 'flip' | 'rental' | 'brrrr';

const addHeader = (doc: jsPDF, deal: Deal, apiData: DealApiData, yPos: number): number => {
  // Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Deal Analysis Summary', 105, yPos, { align: 'center' });
  yPos += 10;

  // Address
  doc.setFontSize(14);
  doc.text(deal.address.street, 105, yPos, { align: 'center' });
  yPos += 6;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${deal.address.city}, ${deal.address.state} ${deal.address.zip}`, 105, yPos, { align: 'center' });
  yPos += 8;

  // Property details
  const details = [];
  if (apiData.bedrooms) details.push(`${apiData.bedrooms} bd`);
  if (apiData.bathrooms) details.push(`${apiData.bathrooms} ba`);
  if (apiData.sqft) details.push(`${apiData.sqft.toLocaleString()} sqft`);
  if (apiData.yearBuilt) details.push(`Built ${apiData.yearBuilt}`);
  
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(details.join(' • '), 105, yPos, { align: 'center' });
  doc.setTextColor(0);
  yPos += 10;

  // Separator line
  doc.setDrawColor(200);
  doc.line(20, yPos, 190, yPos);
  yPos += 8;

  return yPos;
};

const addKeyMetrics = (
  doc: jsPDF, 
  data: ExportData,
  yPos: number
): number => {
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Key Metrics', 20, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const metrics = [
    ['Purchase Price', formatCurrency(data.purchasePrice)],
    ['ARV (After Repair Value)', formatCurrency(data.arv)],
    ['Rehab Cost', formatCurrency(data.rehabCost)],
    ['Monthly Rent', formatCurrency(data.rent)],
  ];

  metrics.forEach(([label, value]) => {
    doc.text(label, 25, yPos);
    doc.text(value, 100, yPos);
    yPos += 6;
  });

  yPos += 4;
  return yPos;
};

const addFlipAnalysis = (
  doc: jsPDF,
  data: ExportData,
  yPos: number,
  isSection: boolean = false
): number => {
  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(34, 197, 94); // Green color
  doc.text(isSection ? 'Flip Analysis' : '📈 Flip Analysis', 20, yPos);
  doc.setTextColor(0);
  yPos += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const { purchasePrice, arv, rehabCost, localOverrides } = data;
  
  // Calculate flip metrics
  const closingPercent = localOverrides.closingCostsPercent 
    ? parseFloat(localOverrides.closingCostsPercent) / 100 
    : 0.02;
  const contingencyPercent = localOverrides.contingencyPercent 
    ? parseFloat(localOverrides.contingencyPercent) / 100 
    : 0.12;
  const holdingMonths = localOverrides.holdingMonths ? parseInt(localOverrides.holdingMonths) : 6;
  
  const closingCosts = localOverrides.closingCostsDollar 
    ? parseFloat(localOverrides.closingCostsDollar)
    : purchasePrice * closingPercent;
  const rehabContingency = rehabCost * contingencyPercent;
  
  const propertyTaxMonthly = localOverrides.propertyTaxMonthly 
    ? parseFloat(localOverrides.propertyTaxMonthly) 
    : (data.apiData.propertyTax ?? 0) / 12;
  const insuranceMonthly = localOverrides.insuranceMonthly 
    ? parseFloat(localOverrides.insuranceMonthly) 
    : getEffectiveMonthlyInsurance(data.apiData.insurance);
  const utilitiesMonthly = localOverrides.utilitiesMonthly 
    ? parseFloat(localOverrides.utilitiesMonthly) 
    : 300;
  
  const monthlyHoldingCost = propertyTaxMonthly + insuranceMonthly + utilitiesMonthly;
  const totalHoldingCosts = monthlyHoldingCost * holdingMonths;
  
  const totalInvestment = purchasePrice + rehabCost + rehabContingency + closingCosts + totalHoldingCosts;
  
  const agentCommission = arv * 0.06;
  const notaryCost = 500 * 2; // HML signing + sale signing
  const titleFees = 500;
  const totalSaleCosts = agentCommission + notaryCost + titleFees;
  
  const netProfit = arv - totalInvestment - totalSaleCosts;
  const roi = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;

  // Cash Deal section
  doc.setFont('helvetica', 'bold');
  doc.text('Cash Deal', 25, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'normal');

  const flipMetrics = [
    ['Purchase Price', formatCurrency(purchasePrice)],
    ['Closing Costs', formatCurrency(closingCosts)],
    ['Rehab Cost', formatCurrency(rehabCost)],
    ['Contingency (' + Math.round(contingencyPercent * 100) + '%)', formatCurrency(rehabContingency)],
    ['Holding Costs (' + holdingMonths + ' mo)', formatCurrency(totalHoldingCosts)],
    ['Total Investment', formatCurrency(totalInvestment)],
    ['', ''],
    ['Sale Price (ARV)', formatCurrency(arv)],
    ['Sale Costs (6%)', formatCurrency(totalSaleCosts)],
    ['', ''],
    ['Net Profit', formatCurrency(netProfit)],
    ['ROI', formatPercent(roi / 100)],
  ];

  flipMetrics.forEach(([label, value]) => {
    if (label === '' && value === '') {
      yPos += 2;
    } else if (label === 'Net Profit' || label === 'ROI') {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 30, yPos);
      doc.text(value, 100, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += 6;
    } else {
      doc.text(label, 30, yPos);
      doc.text(value, 100, yPos);
      yPos += 5;
    }
  });

  yPos += 6;
  return yPos;
};

const addRentalAnalysis = (
  doc: jsPDF,
  data: ExportData,
  yPos: number,
  isSection: boolean = false
): number => {
  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(6, 182, 212); // Cyan color
  doc.text(isSection ? 'Rental Analysis' : '🏠 Rental Analysis', 20, yPos);
  doc.setTextColor(0);
  yPos += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const { purchasePrice, arv, rehabCost, rent, localOverrides, financials, apiData } = data;
  
  // Operating expenses
  const propertyTaxMonthly = localOverrides.propertyTaxMonthly 
    ? parseFloat(localOverrides.propertyTaxMonthly) 
    : (apiData.propertyTax ?? 0) / 12;
  const insuranceMonthly = localOverrides.insuranceMonthly 
    ? parseFloat(localOverrides.insuranceMonthly) 
    : getEffectiveMonthlyInsurance(apiData.insurance);
  const pmPercent = localOverrides.propertyManagementPercent 
    ? parseFloat(localOverrides.propertyManagementPercent) / 100 
    : 0.10;
  const pmFee = rent * pmPercent;
  const vacancy = rent * 0.05;
  const capex = rent * 0.05;
  const totalExpenses = propertyTaxMonthly + insuranceMonthly + pmFee + vacancy + capex;
  const noi = rent - totalExpenses;
  
  // All Cash
  const totalCashInvested = purchasePrice + rehabCost + (purchasePrice * 0.02);
  const capRate = totalCashInvested > 0 ? ((noi * 12) / totalCashInvested) * 100 : 0;

  doc.setFont('helvetica', 'bold');
  doc.text('All Cash', 25, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'normal');

  const cashMetrics = [
    ['Gross Rent', formatCurrency(rent) + '/mo'],
    ['Property Tax', '-' + formatCurrency(propertyTaxMonthly) + '/mo'],
    ['Insurance', '-' + formatCurrency(insuranceMonthly) + '/mo'],
    ['Property Mgmt (' + Math.round(pmPercent * 100) + '%)', '-' + formatCurrency(pmFee) + '/mo'],
    ['Vacancy (5%)', '-' + formatCurrency(vacancy) + '/mo'],
    ['CapEx (5%)', '-' + formatCurrency(capex) + '/mo'],
    ['', ''],
    ['NOI (Net Operating Income)', formatCurrency(noi) + '/mo'],
    ['Annual NOI', formatCurrency(noi * 12)],
    ['Total Cash Invested', formatCurrency(totalCashInvested)],
    ['Cap Rate', formatPercent(capRate / 100)],
  ];

  cashMetrics.forEach(([label, value]) => {
    if (label === '' && value === '') {
      yPos += 2;
    } else if (label === 'NOI (Net Operating Income)' || label === 'Cap Rate') {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 30, yPos);
      doc.text(value, 110, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += 6;
    } else {
      doc.text(label, 30, yPos);
      doc.text(value, 110, yPos);
      yPos += 5;
    }
  });

  yPos += 4;

  // With Financing
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.text('With Financing', 25, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'normal');

  const downPaymentPercent = localOverrides.downPaymentPercent 
    ? parseFloat(localOverrides.downPaymentPercent) 
    : 25;
  const interestRate = localOverrides.interestRate 
    ? parseFloat(localOverrides.interestRate) 
    : 7;
  const loanTermYears = localOverrides.loanTermYears 
    ? parseFloat(localOverrides.loanTermYears) 
    : 30;
  
  const downPayment = purchasePrice * (downPaymentPercent / 100);
  const loanAmount = purchasePrice - downPayment;
  const monthlyRate = (interestRate / 100) / 12;
  const numPayments = loanTermYears * 12;
  const mortgage = loanAmount > 0 && monthlyRate > 0
    ? (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
    : 0;
  
  const cashflowWithFinancing = noi - mortgage;
  const cashRequired = downPayment + rehabCost + (purchasePrice * 0.02);
  const cocReturn = cashRequired > 0 ? ((cashflowWithFinancing * 12) / cashRequired) * 100 : 0;

  const financeMetrics = [
    ['Down Payment (' + downPaymentPercent + '%)', formatCurrency(downPayment)],
    ['Loan Amount', formatCurrency(loanAmount)],
    ['Interest Rate', interestRate + '%'],
    ['Loan Term', loanTermYears + ' years'],
    ['Monthly Mortgage', formatCurrency(mortgage) + '/mo'],
    ['', ''],
    ['Monthly Cashflow', formatCurrency(cashflowWithFinancing) + '/mo'],
    ['Cash Required', formatCurrency(cashRequired)],
    ['Cash-on-Cash Return', formatPercent(cocReturn / 100)],
  ];

  financeMetrics.forEach(([label, value]) => {
    if (label === '' && value === '') {
      yPos += 2;
    } else if (label === 'Monthly Cashflow' || label === 'Cash-on-Cash Return') {
      doc.setFont('helvetica', 'bold');
      doc.text(label, 30, yPos);
      doc.text(value, 110, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += 6;
    } else {
      doc.text(label, 30, yPos);
      doc.text(value, 110, yPos);
      yPos += 5;
    }
  });

  yPos += 6;
  return yPos;
};

const addBRRRRAnalysis = (
  doc: jsPDF,
  data: ExportData,
  yPos: number,
  isSection: boolean = false
): number => {
  // Check if we need a new page
  if (yPos > 220) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(168, 85, 247); // Purple color
  doc.text(isSection ? 'BRRRR Analysis' : '🔄 BRRRR Analysis', 20, yPos);
  doc.setTextColor(0);
  yPos += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const { purchasePrice, arv, rehabCost, rent, localOverrides, apiData } = data;
  
  // HML calculations
  const hmlLtvPurchase = localOverrides.hmlLtvPurchasePercent 
    ? parseFloat(localOverrides.hmlLtvPurchasePercent) / 100 
    : 0.70;
  const hmlLtvRehab = localOverrides.hmlLtvRehabPercent 
    ? parseFloat(localOverrides.hmlLtvRehabPercent) / 100 
    : 1.00;
  const hmlPointsPercent = localOverrides.hmlPointsPercent 
    ? parseFloat(localOverrides.hmlPointsPercent) / 100 
    : 0.02;
  const hmlInterestRate = localOverrides.hmlInterestRate 
    ? parseFloat(localOverrides.hmlInterestRate) / 100 
    : 0.12;
  const holdingMonths = localOverrides.holdingMonths ? parseInt(localOverrides.holdingMonths) : 6;
  
  const hmlLoanPurchase = purchasePrice * hmlLtvPurchase;
  const hmlLoanRehab = rehabCost * hmlLtvRehab;
  const hmlTotalLoan = hmlLoanPurchase + hmlLoanRehab;
  const hmlPoints = hmlTotalLoan * hmlPointsPercent;
  const hmlMonthlyInterest = hmlTotalLoan * (hmlInterestRate / 12);
  const hmlTotalInterest = hmlMonthlyInterest * holdingMonths;
  
  const cashDownPurchase = purchasePrice - hmlLoanPurchase;
  const cashDownRehab = rehabCost - hmlLoanRehab;
  const closingCosts = purchasePrice * 0.02;
  const contingency = rehabCost * 0.12;
  
  const totalCashIn = cashDownPurchase + cashDownRehab + closingCosts + hmlPoints + 1500 + contingency + hmlTotalInterest;
  
  // Refi calculations
  const refiLtv = localOverrides.refiLtvPercent 
    ? parseFloat(localOverrides.refiLtvPercent) / 100 
    : 0.65;
  const refiClosingPercent = localOverrides.refiClosingPercent 
    ? parseFloat(localOverrides.refiClosingPercent) / 100 
    : 0.02;
  
  const refiLoanAmount = arv * refiLtv;
  const refiClosingCosts = refiLoanAmount * refiClosingPercent;
  const cashOutAtRefi = refiLoanAmount - hmlTotalLoan - refiClosingCosts;
  const cashLeftInDeal = totalCashIn - cashOutAtRefi;
  
  // Post-refi rental
  const interestRate = localOverrides.interestRate 
    ? parseFloat(localOverrides.interestRate) 
    : 7;
  const monthlyRate = (interestRate / 100) / 12;
  const numPayments = 30 * 12;
  const refiMortgage = refiLoanAmount > 0 && monthlyRate > 0
    ? (refiLoanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
    : 0;
  
  const propertyTaxMonthly = localOverrides.propertyTaxMonthly 
    ? parseFloat(localOverrides.propertyTaxMonthly) 
    : (apiData.propertyTax ?? 0) / 12;
  const insuranceMonthly = localOverrides.insuranceMonthly 
    ? parseFloat(localOverrides.insuranceMonthly) 
    : getEffectiveMonthlyInsurance(apiData.insurance);
  const pmFee = rent * 0.10;
  const vacancy = rent * 0.05;
  const capex = rent * 0.05;
  const totalExpenses = propertyTaxMonthly + insuranceMonthly + pmFee + vacancy + capex;
  
  const monthlyCashflow = rent - totalExpenses - refiMortgage;
  const cocReturn = cashLeftInDeal > 0 ? ((monthlyCashflow * 12) / cashLeftInDeal) * 100 : 0;

  // Phase 1: Acquisition
  doc.setFont('helvetica', 'bold');
  doc.text('Phase 1: Acquisition (HML)', 25, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'normal');

  const phase1Metrics = [
    ['HML Loan (Purchase ' + Math.round(hmlLtvPurchase * 100) + '%)', formatCurrency(hmlLoanPurchase)],
    ['HML Loan (Rehab ' + Math.round(hmlLtvRehab * 100) + '%)', formatCurrency(hmlLoanRehab)],
    ['Total HML Loan', formatCurrency(hmlTotalLoan)],
    ['Cash Required for Acquisition', formatCurrency(totalCashIn)],
  ];

  phase1Metrics.forEach(([label, value]) => {
    doc.text(label, 30, yPos);
    doc.text(value, 120, yPos);
    yPos += 5;
  });

  yPos += 4;

  // Phase 2: Refinance
  doc.setFont('helvetica', 'bold');
  doc.text('Phase 2: Refinance', 25, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'normal');

  const phase2Metrics = [
    ['ARV', formatCurrency(arv)],
    ['Refi Loan (' + Math.round(refiLtv * 100) + '% LTV)', formatCurrency(refiLoanAmount)],
    ['Pay off HML', '-' + formatCurrency(hmlTotalLoan)],
    ['Refi Closing Costs', '-' + formatCurrency(refiClosingCosts)],
    ['Cash Out at Refi', formatCurrency(Math.max(0, cashOutAtRefi))],
    ['Cash Left in Deal', formatCurrency(Math.max(0, cashLeftInDeal))],
  ];

  phase2Metrics.forEach(([label, value]) => {
    if (label === 'Cash Left in Deal') {
      doc.setFont('helvetica', 'bold');
    }
    doc.text(label, 30, yPos);
    doc.text(value, 120, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 5;
  });

  yPos += 4;

  // Phase 3: Rental
  doc.setFont('helvetica', 'bold');
  doc.text('Phase 3: Rent & Repeat', 25, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'normal');

  const phase3Metrics = [
    ['Gross Rent', formatCurrency(rent) + '/mo'],
    ['Operating Expenses', '-' + formatCurrency(totalExpenses) + '/mo'],
    ['Refi Mortgage', '-' + formatCurrency(refiMortgage) + '/mo'],
    ['Monthly Cashflow', formatCurrency(monthlyCashflow) + '/mo'],
    ['Annual Cashflow', formatCurrency(monthlyCashflow * 12)],
    ['Cash-on-Cash Return', cashLeftInDeal <= 0 ? '∞ (No cash left!)' : formatPercent(cocReturn / 100)],
  ];

  phase3Metrics.forEach(([label, value]) => {
    if (label === 'Monthly Cashflow' || label === 'Cash-on-Cash Return') {
      doc.setFont('helvetica', 'bold');
    }
    doc.text(label, 30, yPos);
    doc.text(value, 120, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += 5;
  });

  yPos += 6;
  return yPos;
};

const addFooter = (doc: jsPDF): void => {
  const pageCount = doc.getNumberOfPages();
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Generated on ${new Date().toLocaleDateString()} • Page ${i} of ${pageCount}`,
      105,
      290,
      { align: 'center' }
    );
  }
};

export const generateDealPDF = (
  data: ExportData,
  analysisType: AnalysisType = 'full'
): void => {
  const doc = new jsPDF();
  let yPos = 20;

  // Add header
  yPos = addHeader(doc, data.deal, data.apiData, yPos);

  if (analysisType === 'full') {
    // Add key metrics
    yPos = addKeyMetrics(doc, data, yPos);
    
    // Add separator
    doc.setDrawColor(200);
    doc.line(20, yPos, 190, yPos);
    yPos += 8;

    // Add all analyses
    yPos = addFlipAnalysis(doc, data, yPos);
    yPos = addRentalAnalysis(doc, data, yPos);
    yPos = addBRRRRAnalysis(doc, data, yPos);
  } else if (analysisType === 'flip') {
    yPos = addKeyMetrics(doc, data, yPos);
    doc.setDrawColor(200);
    doc.line(20, yPos, 190, yPos);
    yPos += 8;
    yPos = addFlipAnalysis(doc, data, yPos, true);
  } else if (analysisType === 'rental') {
    yPos = addKeyMetrics(doc, data, yPos);
    doc.setDrawColor(200);
    doc.line(20, yPos, 190, yPos);
    yPos += 8;
    yPos = addRentalAnalysis(doc, data, yPos, true);
  } else if (analysisType === 'brrrr') {
    yPos = addKeyMetrics(doc, data, yPos);
    doc.setDrawColor(200);
    doc.line(20, yPos, 190, yPos);
    yPos += 8;
    yPos = addBRRRRAnalysis(doc, data, yPos, true);
  }

  // Add footer
  addFooter(doc);

  // Generate filename
  const address = data.deal.address.street.replace(/[^a-zA-Z0-9]/g, '_');
  const typeLabel = analysisType === 'full' ? 'Summary' : analysisType.charAt(0).toUpperCase() + analysisType.slice(1);
  const filename = `${address}_${typeLabel}_${new Date().toISOString().split('T')[0]}.pdf`;

  // Save the PDF
  doc.save(filename);
};
