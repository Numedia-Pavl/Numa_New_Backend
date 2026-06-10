const jwt     = require('jsonwebtoken');
const { supabase } = require('./supabase');

const JWT_SECRET = process.env.JWT_SECRET;

async function verify(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token      = authHeader.replace(/^Bearer\s+/i, '');

    if (!token)
      return res.status(401).json({ success: false, message: 'Not logged in. Please sign in to continue.' });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError')
        return res.status(401).json({ success: false, message: 'Your session has expired. Please sign in again.' });
      return res.status(401).json({ success: false, message: 'Invalid session. Please sign in again.' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, roles, employment_status')
      .eq('id', decoded.id)
      .single();

    if (error || !user)
      return res.status(401).json({ success: false, message: 'Account not found. Contact your HR administrator.' });

    if (user.employment_status === 'inactive')
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact your HR administrator.' });

    req.user = { id: user.id, email: user.email, roles: user.roles || [] };

    if (!req.user.employee_id) {
      const { data: emp } = await supabase.from('employees').select('id').eq('email', user.email).maybeSingle();
      req.user.employee_id = emp?.id || null;
    }

    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    res.status(500).json({ success: false, message: 'Authentication error. Please try again.' });
  }
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated.' });
    const hasRole = allowedRoles.some(r => (req.user.roles || []).includes(r));
    if (!hasRole)
      return res.status(403).json({ success: false, message: `Access denied. Required roles: ${allowedRoles.join(', ')}.` });
    next();
  };
}

function hasRole(req, roles) { return roles.some(r => (req.user?.roles || []).includes(r)); }
const isAdmin   = (req) => hasRole(req, ['admin']);
const isHR      = (req) => hasRole(req, ['admin','hr','hr_manager']);
const isManager = (req) => hasRole(req, ['admin','hr','hr_manager','manager','supervisor','department_head']);

module.exports = { verify, requireRole, hasRole, isAdmin, isHR, isManager };
