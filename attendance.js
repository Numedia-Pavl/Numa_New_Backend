const router = require('express').Router();
const auth   = require('./auth_middleware');
const role   = require('./role');
const sb     = require('./supabase');

// GET /api/attendance
router.get('/', auth, async (req, res) => {
  const roles  = req.user.roles || [];
  const isHR   = ['admin','hr','hr_manager','payroll_officer'].some(r => roles.includes(r));
  const isSup  = roles.includes('manager') || roles.includes('supervisor');

  let query = sb.from('attendance')
    .select('*, employee:employees(employee_id,first_name,last_name,department:departments(name))');

  if (req.query.date)        query = query.eq('date', req.query.date);
  if (req.query.employee_id) query = query.eq('employee_id', req.query.employee_id);
  if (req.query.month)       query = query.ilike('date', `${req.query.month}%`);

  if (!isHR && !isSup) query = query.eq('employee_id', req.user.employee_id);

  const { data, error } = await query.order('date', { ascending: false }).limit(500);
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, attendance: data });
});

// POST /api/attendance — log attendance (HR or self clock-in)
router.post('/', auth, async (req, res) => {
  const { employee_id, date, time_in, time_out, status, notes } = req.body;
  const roles = req.user.roles || [];
  const isHR  = ['admin','hr','hr_manager'].some(r => roles.includes(r));

  // Employees can only log their own
  const empId = isHR ? (employee_id || req.user.employee_id) : req.user.employee_id;

  const { data, error } = await sb.from('attendance').upsert({
    employee_id: empId,
    date:     date || new Date().toISOString().slice(0,10),
    time_in:  time_in || null,
    time_out: time_out || null,
    status:   status || 'present',
    notes:    notes || null,
    logged_by: req.user.id,
  }, { onConflict: 'employee_id,date' }).select().single();

  if (error) return res.status(500).json({ success: false, message: error.message });
  res.status(201).json({ success: true, record: data });
});

// POST /api/attendance/import — bulk CSV import
router.post('/import', auth, role('admin','hr','hr_manager'), async (req, res) => {
  const { records } = req.body; // array of { employee_id, date, time_in, time_out, status }
  if (!Array.isArray(records) || !records.length)
    return res.status(400).json({ success: false, message: 'records array required' });

  const rows = records.map(r => ({
    employee_id: r.employee_id, date: r.date,
    time_in: r.time_in || null, time_out: r.time_out || null,
    status: r.status || 'present', logged_by: req.user.id,
  }));

  const { data, error } = await sb.from('attendance')
    .upsert(rows, { onConflict: 'employee_id,date' }).select();
  if (error) return res.status(500).json({ success: false, message: error.message });

  await sb.from('activity_logs').insert({
    user_id: req.user.id, action: 'ATTENDANCE_IMPORT',
    details: `Imported ${rows.length} attendance records`
  }).catch(() => {});

  res.json({ success: true, imported: data.length });
});

module.exports = router;
