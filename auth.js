const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const sb      = require('./supabase');

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, message: 'Email and password required' });

  const { data: user, error } = await sb
    .from('users')
    .select('*, employee:employees(id, employee_id, first_name, last_name, department:departments(name), position)')
    .eq('email', email.toLowerCase())
    .single();

  if (error || !user)
    return res.status(401).json({ success: false, message: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid)
    return res.status(401).json({ success: false, message: 'Invalid email or password' });

  if (!user.is_active)
    return res.status(403).json({ success: false, message: 'Account is deactivated. Contact your HR admin.' });

  const payload = {
    id:          user.id,
    email:       user.email,
    roles:       user.roles || ['employee'],
    employee_id: user.employee?.employee_id || user.employee_id || null,
    full_name:   user.full_name,
    department:  user.employee?.department?.name || null,
    position:    user.employee?.position || null,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

  // Log login
  await sb.from('activity_logs').insert({
    user_id: user.id, action: 'LOGIN', details: `Logged in from ${req.ip}`
  }).catch(() => {});

  res.json({ success: true, token, user: payload });
});

// ── POST /api/auth/register ───────────────────────────────────────────────────
// Creates a new company admin account + company record
router.post('/register', async (req, res) => {
  const { email, password, first_name, last_name, company_name, industry, headcount, address, phone, plan } = req.body;

  if (!email || !password || !first_name || !last_name)
    return res.status(400).json({ success: false, message: 'Required fields missing' });

  // Check duplicate
  const { data: existing } = await sb.from('users').select('id').eq('email', email.toLowerCase()).single();
  if (existing)
    return res.status(409).json({ success: false, message: 'An account with this email already exists' });

  const hash = await bcrypt.hash(password, 12);
  const full_name = `${first_name} ${last_name}`.trim();

  // Create company record
  const { data: company } = await sb.from('companies').insert({
    name: company_name || full_name + "'s Company",
    industry: industry || null,
    headcount: headcount || null,
    address: address || null,
    plan: plan || 'starter',
  }).select().single();

  // Create admin user
  const { data: user, error } = await sb.from('users').insert({
    email:         email.toLowerCase(),
    password_hash: hash,
    full_name,
    phone:         phone || null,
    roles:         ['admin', 'hr', 'hr_manager', 'employee'],
    is_active:     true,
    company_id:    company?.id || null,
  }).select().single();

  if (error)
    return res.status(500).json({ success: false, message: error.message });

  const payload = {
    id: user.id, email: user.email, roles: user.roles,
    full_name: user.full_name, employee_id: null,
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

  // Log registration
  await sb.from('activity_logs').insert({
    user_id: user.id, action: 'REGISTER',
    details: `New company registered: ${company_name}`
  }).catch(() => {});

  res.status(201).json({ success: true, token, user: payload });
});

// ── POST /api/auth/change-password ───────────────────────────────────────────
const auth = require('./auth_middleware');
router.post('/change-password', auth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password || new_password.length < 8)
    return res.status(400).json({ success: false, message: 'Invalid password data' });

  const { data: user } = await sb.from('users').select('password_hash').eq('id', req.user.id).single();
  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) return res.status(401).json({ success: false, message: 'Current password is incorrect' });

  const hash = await bcrypt.hash(new_password, 12);
  await sb.from('users').update({ password_hash: hash }).eq('id', req.user.id);
  res.json({ success: true, message: 'Password updated successfully' });
});

module.exports = router;
