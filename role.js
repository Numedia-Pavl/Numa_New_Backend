module.exports = function requireRole(...allowed) {
  return (req, res, next) => {
    const roles = req.user?.roles || [];
    const ok = allowed.some(r => roles.includes(r));
    if (!ok) return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    next();
  };
};
