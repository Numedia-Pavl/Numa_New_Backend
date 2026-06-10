require('dotenv').config();
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');

const _sb = require('./supabase');
const supabase = _sb.supabase || _sb;

const auth = require('./auth_middleware');

// ── GET /api/users ── List all users (admin only) ──────────────────────────
router.get('/', auth.verify, auth.requireRole('admin','hr','hr_manager'), async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, roles, employment_status, department, created_at, last_login')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Enrich with employee link info
    const { data: emps } = await supabase
      .from('employees')
      .select('id, employee_id, email, position, department')
      .in('email', users.map(u => u.email).filter(Boolean));

    const empMap = {};
    (emps || []).forEach(e => { empMap[e.email] = e; });

    const enriched = users.map(u => ({
      id:          u.id,
      email:       u.email,
      full_name:   ((u.first_name || '') + ' ' + (u.last_name || '')).trim() || u.email,
      first_name:  u.first_name,
      last_name:   u.last_name,
      roles:       u.roles || ['employee'],
      department:  u.department || empMap[u.email]?.department || null,
      employee_id: empMap[u.email]?.id || null,
      is_active:   u.employment_status !== 'inactive',
      created_at:  u.created_at,
      last_login:  u.last_login,
    }));

    res.json({ success: true, users: enriched });
  } catch (err) {
    console.error('GET /api/users error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/users ── Admin creates a user account ────────────────────────
router.post('/', auth.verify, auth.requireRole('admin','hr','hr_manager'), async (req, res) => {
  try {
    const { email, password, full_name, roles, employee_id, department } = req.body;

    if (!email || !password || !full_name)
      return res.status(400).json({ success: false, message: 'email, password, and full_name are required.' });

    if (password.length < 8)
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });

    const cleanEmail = email.toLowerCase().trim();

    // Check for existing user
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existing)
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });

    const nameParts  = full_name.trim().split(' ');
    const first_name = nameParts[0] || '';
    const last_name  = nameParts.slice(1).join(' ') || '';

    const password_hash = await bcrypt.hash(password, 10);

    const { data: user, error: uErr } = await supabase
      .from('users')
      .insert({
        email:            cleanEmail,
        first_name,
        last_name,
        password_hash,
        roles:            roles || ['employee'],
        department:       department || null,
        employment_status:'active',
      })
      .select()
      .single();

    if (uErr) throw uErr;

    // Link to existing employee record by employee_id or email
    if (employee_id) {
      await supabase
        .from('employees')
        .update({ user_id: user.id, employment_status: 'active' })
        .eq('id', employee_id);
    } else {
      // Try to link by email
      const { data: empByEmail } = await supabase
        .from('employees')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (empByEmail) {
        await supabase
          .from('employees')
          .update({ user_id: user.id })
          .eq('id', empByEmail.id);
      }
    }

    res.status(201).json({
      success: true,
      message: `Account created for ${full_name}.`,
      user: {
        id:        user.id,
        email:     user.email,
        full_name,
        roles:     user.roles,
        is_active: true,
      }
    });

  } catch (err) {
    console.error('POST /api/users error:', err.message);
    if (err.code === '23505')
      return res.status(409).json({ success: false, message: 'Email already exists.' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/users/:id ── Update roles / department ────────────────────────
router.put('/:id', auth.verify, auth.requireRole('admin','hr','hr_manager'), async (req, res) => {
  try {
    const { roles, department, employment_status } = req.body;
    const updates = {};
    if (roles)             updates.roles = roles;
    if (department)        updates.department = department;
    if (employment_status) updates.employment_status = employment_status;

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, user: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/users/:id ── Deactivate (soft delete) ──────────────────────
router.delete('/:id', auth.verify, auth.requireRole('admin'), async (req, res) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ success: false, message: "You cannot deactivate your own account." });

    await supabase
      .from('users')
      .update({ employment_status: 'inactive' })
      .eq('id', req.params.id);

    res.json({ success: true, message: 'User deactivated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
