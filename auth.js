require('dotenv').config();
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

// Safe supabase import — works whether supabase.js exports directly or as { supabase }
const _sb = require('./supabase');
const supabase = _sb.supabase || _sb;

const auth = require('./auth_middleware');

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = '8h';

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password are required.' });

    if (!JWT_SECRET)
      return res.status(500).json({ success: false, message: 'Server configuration error. Contact administrator.' });

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (error) {
      console.error('DB error on login:', error.message);
      return res.status(500).json({ success: false, message: 'Database error. Please try again.' });
    }

    if (!user)
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    if (user.employment_status === 'inactive')
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact HR.' });

    // Support both password_hash and password column names
    const storedHash = user.password_hash || user.password;
    if (!storedHash)
      return res.status(500).json({ success: false, message: 'Account setup incomplete. Contact HR.' });

    const valid = await bcrypt.compare(password, storedHash);
    if (!valid)
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    // Get linked employee record
    const { data: emp } = await supabase
      .from('employees')
      .select('id, employee_id')
      .eq('email', user.email)
      .maybeSingle();

    // Update last login (non-blocking)
    supabase.from('users').update({ last_login: new Date() }).eq('id', user.id).then(() => {});

    const token = jwt.sign(
      { id: user.id, email: user.email, roles: user.roles || [], employee_id: emp?.id || null },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      success: true,
      token,
      user: {
        id         : user.id,
        email      : user.email,
        first_name : user.first_name,
        last_name  : user.last_name,
        roles      : user.roles || [],
        employee_id: emp?.id || null,
      }
    });

  } catch (err) {
    console.error('Login error:', err.message, err.stack);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
});

// ── POST /api/auth/register ───────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { first_name, last_name, email, password, confirm_password } = req.body;

    if (!first_name?.trim() || !last_name?.trim())
      return res.status(400).json({ success: false, message: 'First and last name are required.' });
    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    if (!password || password.length < 8)
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    if (confirm_password !== undefined && password !== confirm_password)
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });

    const cleanEmail = email.toLowerCase().trim();

    const { data: existing } = await supabase
      .from('users').select('id').eq('email', cleanEmail).maybeSingle();

    if (existing)
      return res.status(409).json({
        success: false,
        message: 'This email is already registered. Please sign in.',
        redirect_to_login: true
      });

    const password_hash = await bcrypt.hash(password, 10);

    const { data: user, error: uErr } = await supabase
      .from('users')
      .insert({
        first_name       : first_name.trim(),
        last_name        : last_name.trim(),
        email            : cleanEmail,
        password_hash,
        roles            : ['employee'],
        employment_status: 'active',
      })
      .select().single();

    if (uErr) throw uErr;

    // Link to existing employee record OR create new one
    let empId = null;
    const { data: preloaded } = await supabase
      .from('employees').select('id').eq('email', cleanEmail).maybeSingle();

    if (preloaded) {
      await supabase.from('employees')
        .update({ user_id: user.id, employment_status: 'active' })
        .eq('id', preloaded.id);
      empId = preloaded.id;
    } else {
      const { count } = await supabase.from('employees').select('*', { count: 'exact', head: true });
      const year = new Date().getFullYear();
      const { data: emp } = await supabase.from('employees').insert({
        employee_id      : `EMP-${year}-${String((count || 0) + 1).padStart(3,'0')}`,
        first_name       : first_name.trim(),
        last_name        : last_name.trim(),
        email            : cleanEmail,
        user_id          : user.id,
        employment_status: 'active',
        basic_salary     : 0,
      }).select('id').single();
      empId = emp?.id;
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, roles: user.roles, employee_id: empId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.status(201).json({
      success: true,
      message: `Welcome to NUMA HRIS, ${first_name}!`,
      token,
      user: {
        id: user.id, email: user.email,
        first_name: user.first_name, last_name: user.last_name,
        roles: user.roles, employee_id: empId,
      }
    });

  } catch (err) {
    console.error('Register error:', err.message);
    if (err.code === '23505')
      return res.status(409).json({ success: false, message: 'Email already registered.', redirect_to_login: true });
    res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────
router.get('/me', auth.verify, async (req, res) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, roles, employment_status, last_login')
      .eq('id', req.user.id).single();

    const { data: emp } = await supabase
      .from('employees')
      .select('id, employee_id, first_name, last_name, position, department, basic_salary, employment_type, date_hired')
      .eq('email', user.email).maybeSingle();

    res.json({ success: true, ...user, employee: emp || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/change-password ────────────────────────────
router.post('/change-password', auth.verify, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
      return res.status(400).json({ success: false, message: 'Both passwords are required.' });
    if (new_password.length < 8)
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });

    const { data: user } = await supabase.from('users').select('password_hash').eq('id', req.user.id).single();
    const hash = user.password_hash || user.password;
    const ok = await bcrypt.compare(current_password, hash);
    if (!ok) return res.status(401).json({ success: false, message: 'Current password is incorrect.' });

    await supabase.from('users')
      .update({ password_hash: await bcrypt.hash(new_password, 10) })
      .eq('id', req.user.id);

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
