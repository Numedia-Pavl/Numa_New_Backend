const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const sb     = require('../lib/supabase');

const HR = ['admin','hr','hr_manager'];

// GET /api/employees
router.get('/', auth, async (req, res) => {
  const { data, error } = await sb
    .from('employees')
    .select(`*, department:departments(id,name), supervisor:employees!supervisor_id(id,first_name,last_name)`)
    .eq('is_deleted', false)
    .order('last_name');
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, employees: data });
});

// GET /api/employees/:id
router.get('/:id', auth, async (req, res) => {
  const { data, error } = await sb
    .from('employees')
    .select(`*, department:departments(id,name)`)
    .eq('employee_id', req.params.id)
    .single();
  if (error) return res.status(404).json({ success: false, message: 'Employee not found' });
  res.json({ success: true, employee: data });
});

// POST /api/employees — create
router.post('/', auth, role(...HR), async (req, res) => {
  const {
    first_name, last_name, email, position, department_id,
    employment_type, employment_status, date_hired, basic_pay,
    sss_number, philhealth_number, pagibig_number, tin_number,
    phone, address, emergency_contact, supervisor_id,
  } = req.body;

  if (!first_name || !last_name)
    return res.status(400).json({ success: false, message: 'first_name and last_name required' });

  // Auto-generate employee ID
  const { count } = await sb.from('employees').select('*', { count: 'exact', head: true });
  const seq = String((count || 0) + 1).padStart(3, '0');
  const employee_id = `EMP-${new Date().getFullYear()}-${seq}`;

  const { data, error } = await sb.from('employees').insert({
    employee_id, first_name, last_name, email, position,
    department_id: department_id || null,
    employment_type: employment_type || 'regular',
    employment_status: employment_status || 'active',
    date_hired: date_hired || null,
    basic_pay: parseFloat(basic_pay) || 0,
    sss_number, philhealth_number, pagibig_number, tin_number,
    phone, address, emergency_contact,
    supervisor_id: supervisor_id || null,
    is_deleted: false,
  }).select().single();

  if (error) return res.status(500).json({ success: false, message: error.message });

  await sb.from('activity_logs').insert({
    user_id: req.user.id, action: 'CREATE_EMPLOYEE',
    details: `Added employee ${first_name} ${last_name} (${employee_id})`
  }).catch(() => {});

  res.status(201).json({ success: true, employee: data });
});

// PUT /api/employees/:id — update
router.put('/:id', auth, role(...HR), async (req, res) => {
  const allowed = [
    'first_name','last_name','email','position','department_id',
    'employment_type','employment_status','date_hired','basic_pay',
    'sss_number','philhealth_number','pagibig_number','tin_number',
    'phone','address','emergency_contact','supervisor_id'
  ];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  const { data, error } = await sb.from('employees').update(updates).eq('employee_id', req.params.id).select().single();
  if (error) return res.status(500).json({ success: false, message: error.message });

  await sb.from('activity_logs').insert({
    user_id: req.user.id, action: 'UPDATE_EMPLOYEE', details: `Updated employee ${req.params.id}`
  }).catch(() => {});

  res.json({ success: true, employee: data });
});

// DELETE /api/employees/:id — soft delete
router.delete('/:id', auth, role('admin','hr_manager'), async (req, res) => {
  await sb.from('employees').update({ is_deleted: true, employment_status: 'resigned' }).eq('employee_id', req.params.id);
  res.json({ success: true, message: 'Employee archived' });
});

module.exports = router;
