const router = require('express').Router();
const bcrypt = require('bcryptjs');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const sb     = require('../lib/supabase');

const HR_ROLES = ['admin','hr','hr_manager'];

// GET /api/users — list all users (HR/Admin only)
router.get('/', auth, role(...HR_ROLES), async (req, res) => {
  const { data, error } = await sb
    .from('users')
    .select('id, email, full_name, roles, is_active, created_at, phone, employee_id, employee:employees(employee_id, position, department:departments(name))')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: error.message });
  res.json({ success: true, users: data });
});

// POST /api/users — create user account (HR/Admin only)
router.post('/', auth, role(...HR_ROLES), async (req, res) => {
  const { email, password, full_name, roles, employee_id, department, phone } = req.body;
  if (!email || !password || !full_name)
    return res.status(400).json({ success: false, message: 'email, password, full_name required' });

  const { data: existing } = await sb.from('users').select('id').eq('email', email.toLowerCase()).single();
  if (existing) return res.status(409).json({ success: false, message: 'Email already has an account' });

  const hash = await bcrypt.hash(password, 12);
  const { data: user, error } = await sb.from('users').insert({
    email: email.toLowerCase(), password_hash: hash, full_name,
    roles: roles || ['employee'], is_active: true,
    employee_id: employee_id || null, phone: phone || null,
  }).select().single();

  if (error) return res.status(500).json({ success: false, message: error.message });

  await sb.from('activity_logs').insert({
    user_id: req.user.id, action: 'CREATE_USER',
    details: `Created user account for ${full_name} (${email})`
  }).catch(() => {});

  res.status(201).json({ success: true, user });
});

// PUT /api/users/:id — update user (HR/Admin only)
router.put('/:id', auth, role(...HR_ROLES), async (req, res) => {
  const { email, full_name, roles, is_active, password, phone } = req.body;
  const updates = {};
  if (email)     updates.email    = email.toLowerCase();
  if (full_name) updates.full_name = full_name;
  if (roles)     updates.roles    = roles;
  if (phone)     updates.phone    = phone;
  if (typeof is_active === 'boolean') updates.is_active = is_active;
  if (password && password.length >= 8) updates.password_hash = await bcrypt.hash(password, 12);

  const { data, error } = await sb.from('users').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ success: false, message: error.message });

  await sb.from('activity_logs').insert({
    user_id: req.user.id, action: 'UPDATE_USER', details: `Updated user ${req.params.id}`
  }).catch(() => {});

  res.json({ success: true, user: data });
});

// DELETE /api/users/:id — deactivate (never hard delete)
router.delete('/:id', auth, role('admin'), async (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ success: false, message: 'Cannot deactivate your own account' });
  await sb.from('users').update({ is_active: false }).eq('id', req.params.id);
  res.json({ success: true, message: 'User deactivated' });
});

module.exports = router;
