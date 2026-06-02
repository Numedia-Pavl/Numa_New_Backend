const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const sb     = require('../lib/supabase');

router.get('/', auth, async (req, res) => {
  const roles = req.user.roles || [];
  const isHR  = ['admin','hr','hr_manager'].some(r => roles.includes(r));
  const isSup = roles.includes('manager') || roles.includes('supervisor');

  let query = sb.from('leave_requests')
    .select('*, employee:employees(employee_id,first_name,last_name,department:departments(name))');

  if (!isHR && !isSup) query = query.eq('employee_id', req.user.employee_id);
  if (req.query.status) query = query.eq('status', req.query.status);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, leave_requests: data });
});

router.post('/', auth, async (req, res) => {
  const { leave_type, start_date, end_date, reason } = req.body;
  if (!leave_type || !start_date || !end_date)
    return res.status(400).json({ success: false, message: 'leave_type, start_date, end_date required' });

  const days = Math.ceil((new Date(end_date) - new Date(start_date)) / 86400000) + 1;
  const { data, error } = await sb.from('leave_requests').insert({
    employee_id: req.user.employee_id, leave_type, start_date, end_date,
    days_count: days, reason: reason || '', status: 'pending',
  }).select().single();

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.status(201).json({ success: true, leave_request: data });
});

router.patch('/:id/approve', auth, role('admin','hr','hr_manager','manager'), async (req, res) => {
  const { status, remarks } = req.body; // 'approved' or 'rejected'
  if (!['approved','rejected'].includes(status))
    return res.status(400).json({ success: false, message: 'status must be approved or rejected' });

  const { data, error } = await sb.from('leave_requests')
    .update({ status, approved_by: req.user.id, approval_remarks: remarks || '', approved_at: new Date().toISOString() })
    .eq('id', req.params.id).select().single();

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, leave_request: data });
});

module.exports = router;
