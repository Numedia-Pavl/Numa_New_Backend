require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));

const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || '*').split(',').map(o => o.trim());
app.use(cors({
  origin: ALLOWED_ORIGINS.includes('*') ? '*' : (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a few minutes.' }
}));

app.use('/api/auth/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' }
}));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'NUMA HRIS Backend', version: '2.0.0', timestamp: new Date().toISOString() });
});

app.get('/', (_req, res) => res.json({ message: 'NUMA HRIS API is running.' }));

// Routes — matched to Numa_New_Backend file names
app.use('/api/auth',        require('./auth'));
app.use('/api/employees',   require('./employees'));
app.use('/api/users',       require('./users'));
app.use('/api/departments', require('./departments'));
app.use('/api/payroll',     require('./payroll'));
app.use('/api/attendance',  require('./attendance'));
app.use('/api/leave',       require('./leave'));
app.use('/api/reports',     require('./reports'));
app.use('/api/bir',         require('./bir'));
app.use('/api/settings',    require('./settings'));

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n NUMA HRIS Backend v2.0 running on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health\n`);
});
