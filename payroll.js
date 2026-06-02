const router  = require('express').Router();
const auth    = require('./auth_middleware');
const role    = require('./role');
const sb      = require('./supabase');
const { computePayroll } = require('./payrollEngine');

const PAYROLL_ROLES = ['admin','hr','hr_manager','payroll_officer'];

// GET /api/payroll?period=January+2025
router.get('/', auth, async (req, res) => {
  let query = sb.from('payroll_entries')
    .select('*, employee:employees(employee_id,first_name,last_name,position,department:departments(name))');

  if (req.query.period) query = query.eq('period', req.query.period);

  // Employees only see own payroll
  const roles = req.user.roles || [];
  const isHR  = PAYROLL_ROLES.some(r => roles.includes(r));
  if (!isHR) query = query.eq('employee_id', req.user.employee_id);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, payroll: data });
});

// POST /api/payroll/compute — compute single entry server-side
router.post('/compute', auth, role(...PAYROLL_ROLES), async (req, res) => {
  const { employee_id, basic_pay, overtime = 0, allowances = 0, other_deductions = 0 } = req.body;
  if (!basic_pay) return res.status(400).json({ success: false, message: 'basic_pay required' });
  const result = computePayroll({ basicPay: parseFloat(basic_pay), overtime: parseFloat(overtime), allowances: parseFloat(allowances), otherDeductions: parseFloat(other_deductions) });
  res.json({ success: true, computation: result });
});

// POST /api/payroll — save payroll entry
router.post('/', auth, role(...PAYROLL_ROLES), async (req, res) => {
  const { employee_id, period, basic_pay, overtime = 0, allowances = 0, other_deductions = 0, notes } = req.body;
  if (!employee_id || !period || !basic_pay)
    return res.status(400).json({ success: false, message: 'employee_id, period, basic_pay required' });

  const computed = computePayroll({
    basicPay: parseFloat(basic_pay),
    overtime: parseFloat(overtime),
    allowances: parseFloat(allowances),
    otherDeductions: parseFloat(other_deductions),
  });

  // Upsert — replace if same employee + period exists
  const { data, error } = await sb.from('payroll_entries').upsert({
    employee_id, period,
    basic_pay:       computed.basic,
    overtime_pay:    computed.overtime,
    allowances:      computed.allowances,
    gross_pay:       computed.gross,
    sss_ee:          computed.sss_ee,
    sss_er:          computed.sss_er,
    philhealth_ee:   computed.philhealth_ee,
    philhealth_er:   computed.philhealth_er,
    pagibig_ee:      computed.pagibig_ee,
    pagibig_er:      computed.pagibig_er,
    withholding_tax: computed.withholding_tax,
    other_deductions: computed.other_deductions,
    total_deductions: computed.total_deductions,
    net_pay:         computed.net_pay,
    status:          'draft',
    notes:           notes || null,
    processed_by:    req.user.id,
  }, { onConflict: 'employee_id,period' }).select().single();

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.status(201).json({ success: true, entry: data, computation: computed });
});

// PATCH /api/payroll/submit — submit for approval
router.patch('/submit', auth, role(...PAYROLL_ROLES), async (req, res) => {
  const { period, approver_role, notes } = req.body;
  const { error } = await sb.from('payroll_entries')
    .update({ status: 'pending_approval', approver_role, submitted_by: req.user.id, submitted_at: new Date().toISOString(), approval_notes: notes })
    .eq('period', period);
  if (error) return res.status(500).json({ success: false, message: error.message });

  await sb.from('activity_logs').insert({
    user_id: req.user.id, action: 'PAYROLL_SUBMIT',
    details: `Payroll for ${period} submitted for approval to ${approver_role}`
  }).catch(() => {});

  res.json({ success: true, message: `Payroll submitted for approval` });
});

// PATCH /api/payroll/approve — approve and release
router.patch('/approve', auth, role('admin','hr_manager'), async (req, res) => {
  const { period, approver_name, remarks } = req.body;
  const { error } = await sb.from('payroll_entries')
    .update({ status: 'released', approved_by: req.user.id, approved_by_name: approver_name, approved_at: new Date().toISOString(), approval_remarks: remarks })
    .eq('period', period);
  if (error) return res.status(500).json({ success: false, message: error.message });

  await sb.from('activity_logs').insert({
    user_id: req.user.id, action: 'PAYROLL_APPROVE',
    details: `Payroll for ${period} approved and released by ${approver_name}`
  }).catch(() => {});

  res.json({ success: true, message: 'Payroll released' });
});

module.exports = router;
