-- ═══════════════════════════════════════════════════════════════════════════
-- NUMA HRIS — Complete Supabase PostgreSQL Schema (Fixed)
-- Run this in Supabase → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Companies ────────────────────────────────────────────────────────────────
create table if not exists companies (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  industry    text,
  headcount   text,
  address     text,
  plan        text default 'starter',
  created_at  timestamptz default now()
);

-- ── Departments (no FK to employees yet — added later) ────────────────────────
create table if not exists departments (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null unique,
  description  text,
  company_id   uuid references companies(id),
  created_at   timestamptz default now()
);

-- ── Employees ────────────────────────────────────────────────────────────────
create table if not exists employees (
  id                  uuid primary key default uuid_generate_v4(),
  employee_id         text unique not null,
  first_name          text not null,
  last_name           text not null,
  email               text,
  phone               text,
  address             text,
  position            text,
  department_id       uuid references departments(id) on delete set null,
  supervisor_id       uuid references employees(id) on delete set null,
  employment_type     text default 'regular',
  employment_status   text default 'active',
  date_hired          date,
  basic_pay           numeric(12,2) default 0,
  sss_number          text,
  philhealth_number   text,
  pagibig_number      text,
  tin_number          text,
  emergency_contact   jsonb,
  is_deleted          boolean default false,
  company_id          uuid references companies(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ── NOW add head_employee_id to departments (employees table exists now) ──────
alter table departments
  add column if not exists head_employee_id uuid references employees(id) on delete set null;

-- ── Users ────────────────────────────────────────────────────────────────────
create table if not exists users (
  id              uuid primary key default uuid_generate_v4(),
  email           text unique not null,
  password_hash   text not null,
  full_name       text not null,
  phone           text,
  roles           text[] default array['employee'],
  is_active       boolean default true,
  employee_id     uuid references employees(id) on delete set null,
  company_id      uuid references companies(id),
  last_login      timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── Payroll Entries ──────────────────────────────────────────────────────────
create table if not exists payroll_entries (
  id               uuid primary key default uuid_generate_v4(),
  employee_id      text not null references employees(employee_id) on delete cascade,
  period           text not null,
  basic_pay        numeric(12,2) default 0,
  overtime_pay     numeric(12,2) default 0,
  allowances       numeric(12,2) default 0,
  gross_pay        numeric(12,2) default 0,
  sss_ee           numeric(10,2) default 0,
  philhealth_ee    numeric(10,2) default 0,
  pagibig_ee       numeric(10,2) default 0,
  withholding_tax  numeric(12,2) default 0,
  other_deductions numeric(12,2) default 0,
  total_deductions numeric(12,2) default 0,
  net_pay          numeric(12,2) default 0,
  sss_er           numeric(10,2) default 0,
  philhealth_er    numeric(10,2) default 0,
  pagibig_er       numeric(10,2) default 0,
  status           text default 'draft',
  approver_role    text,
  submitted_by     uuid references users(id),
  submitted_at     timestamptz,
  approved_by      uuid references users(id),
  approved_by_name text,
  approved_at      timestamptz,
  approval_notes   text,
  approval_remarks text,
  notes            text,
  processed_by     uuid references users(id),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique(employee_id, period)
);

-- ── Attendance ───────────────────────────────────────────────────────────────
create table if not exists attendance (
  id           uuid primary key default uuid_generate_v4(),
  employee_id  text not null references employees(employee_id) on delete cascade,
  date         date not null,
  time_in      time,
  time_out     time,
  status       text default 'present',
  notes        text,
  logged_by    uuid references users(id),
  created_at   timestamptz default now(),
  unique(employee_id, date)
);

-- ── Leave Requests ───────────────────────────────────────────────────────────
create table if not exists leave_requests (
  id                uuid primary key default uuid_generate_v4(),
  employee_id       text not null references employees(employee_id) on delete cascade,
  leave_type        text not null,
  start_date        date not null,
  end_date          date not null,
  days_count        int default 1,
  reason            text,
  status            text default 'pending',
  approved_by       uuid references users(id),
  approval_remarks  text,
  approved_at       timestamptz,
  created_at        timestamptz default now()
);

-- ── Leave Balances ───────────────────────────────────────────────────────────
create table if not exists leave_balances (
  id           uuid primary key default uuid_generate_v4(),
  employee_id  text not null references employees(employee_id) on delete cascade,
  year         int not null,
  sick_leave   numeric(5,1) default 15,
  vacation     numeric(5,1) default 15,
  emergency    numeric(5,1) default 3,
  unique(employee_id, year)
);

-- ── Activity Logs ─────────────────────────────────────────────────────────────
create table if not exists activity_logs (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references users(id),
  action     text not null,
  details    text,
  ip_address text,
  created_at timestamptz default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_employees_status    on employees(employment_status);
create index if not exists idx_employees_dept      on employees(department_id);
create index if not exists idx_payroll_period      on payroll_entries(period);
create index if not exists idx_payroll_employee    on payroll_entries(employee_id);
create index if not exists idx_attendance_date     on attendance(date);
create index if not exists idx_attendance_employee on attendance(employee_id);
create index if not exists idx_leave_employee      on leave_requests(employee_id);
create index if not exists idx_leave_status        on leave_requests(status);
create index if not exists idx_logs_created        on activity_logs(created_at);

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table users           enable row level security;
alter table payroll_entries enable row level security;
alter table employees       enable row level security;

-- ── Default Admin User ────────────────────────────────────────────────────────
-- Password: NumaAdmin2024!
-- Change this immediately after first login
insert into users (email, password_hash, full_name, roles, is_active)
values (
  'admin@numahris.ph',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniMKmCFVMmLSCMwjEJbDBuFWi',
  'NUMA Admin',
  array['admin','hr','hr_manager','payroll_officer','employee'],
  true
) on conflict (email) do nothing;

-- ── Done ─────────────────────────────────────────────────────────────────────
-- You should now see 9 tables in your Table Editor:
-- companies, departments, employees, users, payroll_entries,
-- attendance, leave_requests, leave_balances, activity_logs
