const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const sb     = require('../lib/supabase');

const PAYROLL_ROLES = ['admin','hr','hr_manager','payroll_officer'];

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad  = (v, n, ch='0') => String(v ?? '').padStart(n, ch);
const padR = (v, n, ch=' ') => String(v ?? '').padEnd(n, ch);
const fmt2 = n => parseFloat(n || 0).toFixed(2);

// ── GET /api/bir/1601c?period=2025-01 ─────────────────────────────────────────
// BIR Form 1601-C: Monthly Remittance Return of Creditable Income Taxes Withheld
router.get('/1601c', auth, role(...PAYROLL_ROLES), async (req, res) => {
  const { period, tin, company_name } = req.query;
  if (!period) return res.status(400).json({ success: false, message: 'period required (YYYY-MM)' });

  const { data: entries } = await sb.from('payroll_entries')
    .select('*, employee:employees(first_name,last_name,tin_number)')
    .ilike('period', `%${period.slice(0,7)}%`)
    .eq('status', 'released');

  const totalTax    = (entries||[]).reduce((s,e) => s + (parseFloat(e.withholding_tax)||0), 0);
  const totalGross  = (entries||[]).reduce((s,e) => s + (parseFloat(e.gross_pay)||0), 0);
  const numEmployees = (entries||[]).length;
  const [year, month] = (period || '').split('-');

  const csv = [
    ['BIR FORM 1601-C - Monthly Remittance of Creditable Income Taxes Withheld'],
    ['Company TIN:', tin || 'XXX-XXX-XXX-XXX'],
    ['Company Name:', company_name || 'Your Company'],
    ['Period:', `${month}/${year}`],
    [''],
    ['No. of Employees Withheld:', numEmployees],
    ['Total Gross Compensation:', fmt2(totalGross)],
    ['Total Withholding Tax:', fmt2(totalTax)],
    [''],
    ['--- EMPLOYEE BREAKDOWN ---'],
    ['Employee Name', 'TIN', 'Gross Compensation', 'Withholding Tax'],
    ...(entries||[]).map(e => [
      `${e.employee?.last_name || ''}, ${e.employee?.first_name || ''}`,
      e.employee?.tin_number || 'N/A',
      fmt2(e.gross_pay),
      fmt2(e.withholding_tax),
    ])
  ].map(row => row.join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="BIR_1601C_${period}.csv"`);
  res.send(csv);
});

// ── GET /api/bir/2316?year=2025 ───────────────────────────────────────────────
// BIR Form 2316: Certificate of Compensation Payment/Tax Withheld (per employee, annual)
router.get('/2316', auth, role(...PAYROLL_ROLES), async (req, res) => {
  const { year, employee_id, company_name, tin } = req.query;
  if (!year || !employee_id)
    return res.status(400).json({ success: false, message: 'year and employee_id required' });

  const { data: entries } = await sb.from('payroll_entries')
    .select('*, employee:employees(first_name,last_name,tin_number,sss_number,philhealth_number,pagibig_number,position,date_hired,department:departments(name))')
    .eq('employee_id', employee_id)
    .ilike('period', `%${year}%`)
    .eq('status', 'released');

  if (!entries?.length)
    return res.status(404).json({ success: false, message: 'No released payroll entries found for this employee and year' });

  const emp = entries[0].employee;
  const annualGross = entries.reduce((s,e) => s + (parseFloat(e.gross_pay)||0), 0);
  const annualTax   = entries.reduce((s,e) => s + (parseFloat(e.withholding_tax)||0), 0);
  const annualSSS   = entries.reduce((s,e) => s + (parseFloat(e.sss_ee)||0), 0);
  const annualPH    = entries.reduce((s,e) => s + (parseFloat(e.philhealth_ee)||0), 0);
  const annualPI    = entries.reduce((s,e) => s + (parseFloat(e.pagibig_ee)||0), 0);

  const csv = [
    ['BIR FORM 2316 - Certificate of Compensation Payment / Tax Withheld'],
    ['For the Year:', year],
    [''],
    ['EMPLOYER INFORMATION'],
    ['Company Name:', company_name || 'Your Company'],
    ['Employer TIN:', tin || 'XXX-XXX-XXX-XXX'],
    [''],
    ['EMPLOYEE INFORMATION'],
    ['Employee Name:', `${emp?.last_name || ''}, ${emp?.first_name || ''}`],
    ['TIN:', emp?.tin_number || 'N/A'],
    ['SSS Number:', emp?.sss_number || 'N/A'],
    ['PhilHealth Number:', emp?.philhealth_number || 'N/A'],
    ['Pag-IBIG Number:', emp?.pagibig_number || 'N/A'],
    ['Position:', emp?.position || 'N/A'],
    ['Department:', emp?.department?.name || 'N/A'],
    [''],
    ['COMPENSATION SUMMARY'],
    ['Annual Gross Compensation:', fmt2(annualGross)],
    ['Annual Withholding Tax:', fmt2(annualTax)],
    [''],
    ['MANDATORY DEDUCTIONS (Employee Share)'],
    ['SSS Contributions:', fmt2(annualSSS)],
    ['PhilHealth Contributions:', fmt2(annualPH)],
    ['Pag-IBIG Contributions:', fmt2(annualPI)],
    ['Total Mandatory Deductions:', fmt2(annualSSS + annualPH + annualPI)],
    [''],
    ['MONTHLY BREAKDOWN'],
    ['Period', 'Gross Pay', 'SSS', 'PhilHealth', 'Pag-IBIG', 'W/H Tax', 'Net Pay'],
    ...entries.map(e => [
      e.period,
      fmt2(e.gross_pay), fmt2(e.sss_ee),
      fmt2(e.philhealth_ee), fmt2(e.pagibig_ee),
      fmt2(e.withholding_tax), fmt2(e.net_pay),
    ])
  ].map(r => r.join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="BIR_2316_${employee_id}_${year}.csv"`);
  res.send(csv);
});

// ── GET /api/bir/sss-r3?period=2025-01 ───────────────────────────────────────
// SSS Form R-3: Contribution Collection List
router.get('/sss-r3', auth, role(...PAYROLL_ROLES), async (req, res) => {
  const { period } = req.query;
  if (!period) return res.status(400).json({ success: false, message: 'period required' });

  const { data: entries } = await sb.from('payroll_entries')
    .select('employee_id, sss_ee, sss_er, employee:employees(first_name,last_name,sss_number)')
    .ilike('period', `%${period.slice(0,7)}%`)
    .eq('status', 'released');

  // SSS R-3 fixed-width format
  const lines = ['EMPLOYER SSS NO: XXXXXXXXXXXX', `APPLICABLE MONTH: ${period}`, ''];
  let seq = 1;
  (entries||[]).forEach(e => {
    const name   = `${e.employee?.last_name || ''},${e.employee?.first_name || ''}`;
    const sssNo  = (e.employee?.sss_number || '').replace(/-/g,'');
    const ee     = fmt2(e.sss_ee);
    const er     = fmt2(e.sss_er);
    const total  = fmt2((parseFloat(e.sss_ee)||0) + (parseFloat(e.sss_er)||0));
    lines.push(`${pad(seq,5)} ${padR(sssNo,12)} ${padR(name,40)} ${pad(ee,10)} ${pad(er,10)} ${pad(total,12)}`);
    seq++;
  });
  const totEE = (entries||[]).reduce((s,e)=>s+(parseFloat(e.sss_ee)||0),0);
  const totER = (entries||[]).reduce((s,e)=>s+(parseFloat(e.sss_er)||0),0);
  lines.push('');
  lines.push(`TOTAL EMPLOYEE SHARE: ${fmt2(totEE)}`);
  lines.push(`TOTAL EMPLOYER SHARE: ${fmt2(totER)}`);
  lines.push(`TOTAL REMITTANCE:     ${fmt2(totEE+totER)}`);

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="SSS_R3_${period}.txt"`);
  res.send(lines.join('\n'));
});

// ── GET /api/bir/philhealth-rf1?period=2025-01 ────────────────────────────────
// PhilHealth Form RF-1: Remittance Form
router.get('/philhealth-rf1', auth, role(...PAYROLL_ROLES), async (req, res) => {
  const { period } = req.query;
  const { data: entries } = await sb.from('payroll_entries')
    .select('employee_id, philhealth_ee, philhealth_er, employee:employees(first_name,last_name,philhealth_number)')
    .ilike('period', `%${period?.slice(0,7)}%`)
    .eq('status', 'released');

  const csv = [
    ['PhilHealth RF-1 — Monthly Contribution Remittance Form'],
    ['Period:', period],
    [''],
    ['Seq No', 'PhilHealth No', 'Last Name', 'First Name', 'Employee Share', 'Employer Share', 'Total'],
    ...(entries||[]).map((e,i) => [
      i+1,
      e.employee?.philhealth_number || 'N/A',
      e.employee?.last_name || '',
      e.employee?.first_name || '',
      fmt2(e.philhealth_ee),
      fmt2(e.philhealth_er),
      fmt2((parseFloat(e.philhealth_ee)||0) + (parseFloat(e.philhealth_er)||0)),
    ])
  ].map(r => r.join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="PhilHealth_RF1_${period}.csv"`);
  res.send(csv);
});

// ── GET /api/bir/pagibig-mcrf?period=2025-01 ──────────────────────────────────
// Pag-IBIG MCRF: Monthly Contribution Remittance Form
router.get('/pagibig-mcrf', auth, role(...PAYROLL_ROLES), async (req, res) => {
  const { period } = req.query;
  const { data: entries } = await sb.from('payroll_entries')
    .select('employee_id, pagibig_ee, pagibig_er, basic_pay, employee:employees(first_name,last_name,pagibig_number)')
    .ilike('period', `%${period?.slice(0,7)}%`)
    .eq('status', 'released');

  const csv = [
    ['Pag-IBIG MCRF — Monthly Contribution Remittance Form'],
    ['Period:', period],
    [''],
    ['Seq', 'Pag-IBIG MID No', 'Last Name', 'First Name', 'Monthly Compensation', 'Employee Share', 'Employer Share'],
    ...(entries||[]).map((e,i) => [
      i+1,
      e.employee?.pagibig_number || 'N/A',
      e.employee?.last_name || '',
      e.employee?.first_name || '',
      fmt2(e.basic_pay),
      fmt2(e.pagibig_ee),
      fmt2(e.pagibig_er),
    ])
  ].map(r => r.join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="PagIBIG_MCRF_${period}.csv"`);
  res.send(csv);
});

module.exports = router;
