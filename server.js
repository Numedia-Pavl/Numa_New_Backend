require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app = express();

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'] }));
app.use(express.json());

// ── Routes — flat file structure ─────────────────────────────────────────────
app.use('/api/auth',        require('./auth'));
app.use('/api/employees',   require('./employees'));
app.use('/api/users',       require('./users'));
app.use('/api/departments', require('./departments'));
app.use('/api/payroll',     require('./payroll'));
app.use('/api/attendance',  require('./attendance'));
app.use('/api/leave',       require('./leave'));
app.use('/api/bir',         require('./bir'));
app.use('/api/reports',     require('./reports'));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'NUMA HRIS API running', version: '2.0' }));
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`NUMA API listening on port ${PORT}`));
