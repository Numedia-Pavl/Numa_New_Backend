const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const sb     = require('../lib/supabase');

router.get('/payroll-summary', auth, role('admin','hr','hr_manager','payroll_officer'), async (req, res) => {
  const { period } = req.query;
  let query = sb.from('payroll_entries')
    .select('*, employee:employees(employee_id,first_name,last_name,position,department:departments(name))');
  if (period) query = query.ilike('period', `%${period}%`);
  const { data, error } = await query.eq('status','released').order('period');
  if (error) return res.status(500).json({ success: false, message: error.message });

  const summary = {
    total_gross:    data.reduce((s,e)=>s+(parseFloat(e.gross_pay)||0),0),
    total_net:      data.reduce((s,e)=>s+(parseFloat(e.net_pay)||0),0),
    total_sss:      data.reduce((s,e)=>s+(parseFloat(e.sss_ee)||0),0),
    total_philhealth: data.reduce((s,e)=>s+(parseFloat(e.philhealth_ee)||0),0),
    total_pagibig:  data.reduce((s,e)=>s+(parseFloat(e.pagibig_ee)||0),0),
    total_tax:      data.reduce((s,e)=>s+(parseFloat(e.withholding_tax)||0),0),
    employee_count: data.length,
    entries: data,
  };
  res.json({ success: true, summary });
});

module.exports = router;
