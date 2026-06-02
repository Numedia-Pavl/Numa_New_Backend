require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'] }));
app.use(express.json());

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/employees',   require('./routes/employees'));
app.use('/api/users',       require('./routes/users'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/payroll',     require('./routes/payroll'));
app.use('/api/attendance',  require('./routes/attendance'));
app.use('/api/leave',       require('./routes/leave'));
app.use('/api/bir',         require('./routes/bir'));        // Month 2: BIR exports
app.use('/api/reports',     require('./routes/reports'));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'NUMA HRIS API running', version: '2.0' }));

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`NUMA API listening on port ${PORT}`));
