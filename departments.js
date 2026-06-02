const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const sb     = require('../lib/supabase');

router.get('/', auth, async (req, res) => {
  const { data, error } = await sb.from('departments')
    .select('*, head:employees!head_employee_id(first_name,last_name,position)')
    .order('name');
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, departments: data });
});

router.post('/', auth, role('admin','hr','hr_manager'), async (req, res) => {
  const { name, description, head_employee_id } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'name required' });
  const { data, error } = await sb.from('departments')
    .insert({ name, description, head_employee_id: head_employee_id || null })
    .select().single();
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.status(201).json({ success: true, department: data });
});

router.put('/:id', auth, role('admin','hr','hr_manager'), async (req, res) => {
  const { name, description, head_employee_id } = req.body;
  const { data, error } = await sb.from('departments')
    .update({ name, description, head_employee_id })
    .eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, department: data });
});

router.delete('/:id', auth, role('admin'), async (req, res) => {
  // Unassign employees first
  await sb.from('employees').update({ department_id: null }).eq('department_id', req.params.id);
  await sb.from('departments').delete().eq('id', req.params.id);
  res.json({ success: true, message: 'Department removed' });
});

module.exports = router;
