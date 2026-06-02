# NUMA HRIS Backend — Deployment Guide
# ═══════════════════════════════════════

## What's in this package

```
numa-backend/
├── server.js              ← Entry point
├── package.json
├── .env.example           ← Copy to Railway env vars
├── schema.sql             ← Run once in Supabase SQL editor
├── lib/
│   ├── supabase.js        ← DB client
│   └── payrollEngine.js   ← SSS/PhilHealth/Pag-IBIG/TRAIN Law computations
├── middleware/
│   ├── auth.js            ← JWT verification
│   └── role.js            ← Role guard
└── routes/
    ├── auth.js            ← POST /login, POST /register
    ├── employees.js       ← Full CRUD
    ├── users.js           ← User account management
    ├── departments.js     ← Department CRUD
    ├── payroll.js         ← Compute + approval workflow
    ├── attendance.js      ← DTR + bulk CSV import
    ├── leave.js           ← Leave requests + approvals
    ├── bir.js             ← 1601-C, 2316, SSS R3, PhilHealth RF-1, Pag-IBIG MCRF
    └── reports.js         ← Payroll summaries
```

---

## Step 1 — Run the Supabase Schema

1. Go to your Supabase project → **SQL Editor** → **New Query**
2. Paste the contents of `schema.sql`
3. Click **Run**
4. Check the **Table Editor** — you should see: companies, departments, employees, users, payroll_entries, attendance, leave_requests, leave_balances, activity_logs

---

## Step 2 — Deploy to Railway

### Option A: GitHub (recommended)
1. Push this folder to a GitHub repo (can be private)
2. In Railway → **New Project** → **Deploy from GitHub** → select your repo
3. Railway auto-detects Node.js and runs `npm start`

### Option B: Railway CLI
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

---

## Step 3 — Set Environment Variables in Railway

In Railway → your service → **Variables** tab, add:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | From Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase → Project Settings → API → service_role (secret) |
| `JWT_SECRET` | Any long random string (e.g. `openssl rand -base64 32`) |
| `PORT` | 3000 |
| `NODE_ENV` | production |

---

## Step 4 — Test the deployment

```bash
# Health check
curl https://your-railway-url.up.railway.app/

# Login test
curl -X POST https://your-railway-url.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@numahris.ph","password":"NumaAdmin2024!"}'

# Register new company
curl -X POST https://your-railway-url.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"hr@client.com","password":"SecurePass123","first_name":"Maria","last_name":"Santos","company_name":"Reyes Trading Inc"}'
```

---

## Step 5 — Update frontend URL

In `index.html`, find:
```javascript
const API_REAL = 'https://numabackend-production-562a.up.railway.app';
```
Change to your new Railway URL if you deployed a fresh project.

---

## New API Endpoints (Month 1 + 2)

### Month 1 — Data Persistence
| Method | Route | Description |
|---|---|---|
| POST | /api/auth/register | Create company + admin account |
| POST | /api/auth/login | Login |
| POST | /api/auth/change-password | Change password |
| GET/POST/PUT/DELETE | /api/employees | Full employee CRUD |
| GET/POST/PUT/DELETE | /api/users | User account management |
| GET/POST/PUT/DELETE | /api/departments | Department CRUD |
| GET/POST | /api/attendance | DTR + bulk import |
| GET/POST/PATCH | /api/leave | Leave requests + approvals |
| GET/POST/PATCH | /api/payroll | Payroll with approval workflow |

### Month 2 — BIR Exports
| Method | Route | Description |
|---|---|---|
| GET | /api/bir/1601c?period=2025-01 | BIR Form 1601-C (monthly WHT remittance) |
| GET | /api/bir/2316?year=2025&employee_id=EMP-001 | BIR Form 2316 (annual per employee) |
| GET | /api/bir/sss-r3?period=2025-01 | SSS R-3 contribution list |
| GET | /api/bir/philhealth-rf1?period=2025-01 | PhilHealth RF-1 |
| GET | /api/bir/pagibig-mcrf?period=2025-01 | Pag-IBIG MCRF |
| GET | /api/reports/payroll-summary?period=2025-01 | Full payroll summary |

---

## Default Login After Schema Seed
- Email: `admin@numahris.ph`
- Password: `NumaAdmin2024!`
- **Change this immediately after first login**
