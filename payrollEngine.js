// ═══════════════════════════════════════════════════════════════════════════════
// NUMA HRIS — Philippine Government Contributions & Tax Computation
// Sources: SSS 2024 Contribution Table, PhilHealth 2024, Pag-IBIG, TRAIN Law 2024
// All computations are server-authoritative — never trust client-side values.
// ═══════════════════════════════════════════════════════════════════════════════

// ── SSS 2024 Contribution Table ───────────────────────────────────────────────
// Employee share = ~4.5%, Employer share = ~9.5%
const SSS_TABLE = [
  { min:    0,    max:  4249.99, ee:  180, er:  380 },
  { min: 4250,    max:  4749.99, ee:  202.50, er: 427.50 },
  { min: 4750,    max:  5249.99, ee:  225, er:  475 },
  { min: 5250,    max:  5749.99, ee:  247.50, er: 522.50 },
  { min: 5750,    max:  6249.99, ee:  270, er:  570 },
  { min: 6250,    max:  6749.99, ee:  292.50, er: 617.50 },
  { min: 6750,    max:  7249.99, ee:  315, er:  665 },
  { min: 7250,    max:  7749.99, ee:  337.50, er: 712.50 },
  { min: 7750,    max:  8249.99, ee:  360, er:  760 },
  { min: 8250,    max:  8749.99, ee:  382.50, er: 807.50 },
  { min: 8750,    max:  9249.99, ee:  405, er:  855 },
  { min: 9250,    max:  9749.99, ee:  427.50, er: 902.50 },
  { min: 9750,    max: 10249.99, ee:  450, er:  950 },
  { min:10250,    max: 10749.99, ee:  472.50, er: 997.50 },
  { min:10750,    max: 11249.99, ee:  495, er: 1045 },
  { min:11250,    max: 11749.99, ee:  517.50, er: 1092.50 },
  { min:11750,    max: 12249.99, ee:  540, er: 1140 },
  { min:12250,    max: 12749.99, ee:  562.50, er: 1187.50 },
  { min:12750,    max: 13249.99, ee:  585, er: 1235 },
  { min:13250,    max: 13749.99, ee:  607.50, er: 1282.50 },
  { min:13750,    max: 14249.99, ee:  630, er: 1330 },
  { min:14250,    max: 14749.99, ee:  652.50, er: 1377.50 },
  { min:14750,    max: 15249.99, ee:  675, er: 1425 },
  { min:15250,    max: 15749.99, ee:  697.50, er: 1472.50 },
  { min:15750,    max: 16249.99, ee:  720, er: 1520 },
  { min:16250,    max: 16749.99, ee:  742.50, er: 1567.50 },
  { min:16750,    max: 17249.99, ee:  765, er: 1615 },
  { min:17250,    max: 17749.99, ee:  787.50, er: 1662.50 },
  { min:17750,    max: 18249.99, ee:  810, er: 1710 },
  { min:18250,    max: 18749.99, ee:  832.50, er: 1757.50 },
  { min:18750,    max: 19249.99, ee:  855, er: 1805 },
  { min:19250,    max: 19749.99, ee:  877.50, er: 1852.50 },
  { min:19750,    max: 20249.99, ee:  900, er: 1900 },
  { min:20250,    max: 99999999, ee:  900, er: 1900 },  // capped at MSC 20,000
];

function computeSSS(basicPay) {
  const row = SSS_TABLE.find(r => basicPay >= r.min && basicPay <= r.max)
           || SSS_TABLE[SSS_TABLE.length - 1];
  return { employee: row.ee, employer: row.er };
}

// ── PhilHealth 2024 — 5% of basic pay, split equally ─────────────────────────
// Minimum floor: ₱10,000 MSC → minimum contribution ₱500 total (₱250 each)
// Maximum ceiling: ₱100,000 MSC → max ₱5,000 total (₱2,500 each)
function computePhilHealth(basicPay) {
  const msc    = Math.min(Math.max(basicPay, 10000), 100000);
  const total  = msc * 0.05;
  const share  = total / 2;
  return { employee: share, employer: share, total };
}

// ── Pag-IBIG 2024 ─────────────────────────────────────────────────────────────
// 2% of basic pay (capped at ₱100/month employee share for salary ≤ ₱1,500)
// For salary > ₱1,500: employee 2%, employer 2% — both capped at MSC ₱5,000
function computePagIbig(basicPay) {
  let eeRate = 0.02;
  let erRate = 0.02;
  if (basicPay <= 1500) { eeRate = 0.01; erRate = 0.02; }
  const msc = Math.min(basicPay, 5000);
  const employee = Math.min(msc * eeRate, 100);
  const employer = msc * erRate;
  return { employee, employer };
}

// ── TRAIN Law 2024 — Monthly Withholding Tax ──────────────────────────────────
// Based on monthly taxable income (gross - mandatory deductions)
// Tax table effective January 2023 onwards
function computeWithholdingTax(taxableMonthly) {
  let tax = 0;
  if      (taxableMonthly <= 20833)              tax = 0;
  else if (taxableMonthly <= 33332)              tax = (taxableMonthly - 20833) * 0.20;
  else if (taxableMonthly <= 66666)              tax = 2500  + (taxableMonthly - 33333) * 0.25;
  else if (taxableMonthly <= 166666)             tax = 10833 + (taxableMonthly - 66667) * 0.30;
  else if (taxableMonthly <= 666666)             tax = 40833 + (taxableMonthly - 166667) * 0.32;
  else                                           tax = 200833 + (taxableMonthly - 666667) * 0.35;
  return Math.max(0, tax);
}

// ── Master compute function ────────────────────────────────────────────────────
function computePayroll({ basicPay, overtime = 0, allowances = 0, otherDeductions = 0 }) {
  const grossPay = basicPay + overtime + allowances;

  const sss       = computeSSS(basicPay);
  const philhealth = computePhilHealth(basicPay);
  const pagibig   = computePagIbig(basicPay);

  const mandatoryDed  = sss.employee + philhealth.employee + pagibig.employee;
  const taxableIncome = basicPay - mandatoryDed;   // allowances are non-taxable by default
  const withholdingTax = computeWithholdingTax(taxableIncome);

  const totalDeductions = mandatoryDed + withholdingTax + otherDeductions;
  const netPay          = grossPay - totalDeductions;

  return {
    basic:         basicPay,
    overtime,
    allowances,
    gross:         grossPay,
    sss_ee:        sss.employee,
    sss_er:        sss.employer,
    philhealth_ee: philhealth.employee,
    philhealth_er: philhealth.employer,
    pagibig_ee:    pagibig.employee,
    pagibig_er:    pagibig.employer,
    withholding_tax: withholdingTax,
    other_deductions: otherDeductions,
    total_deductions: totalDeductions,
    net_pay:       netPay,
    taxable_income: taxableIncome,
  };
}

module.exports = { computePayroll, computeSSS, computePhilHealth, computePagIbig, computeWithholdingTax };
