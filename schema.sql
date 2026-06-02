-- ═══════════════════════════════════════════════════════════════════════════
-- NUMA HRIS — Complete Supabase PostgreSQL Schema
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

-- ── Departments ──────────────────────────────────────────────────────────────
create table if not exists departments (
  id                 uuid primary key default uuid_generate_v4(),
  name               text not null unique,
  description        text,
  head_employee_id   uuid,
  company_id         uuid references companies(id),
  created_at         timestamptz default now()
);

-- ── Employees ────────────────────────────────────────────────────────────────
create table if not exists employees (
  id                  uuid primary key default uuid_generate_v4(),
  employee_id         text unique not null,      -- e.g. EMP-2024-001
  first_name          text not null,
  last_name           text not null,
  email               text,
  phone               text,
  address             text,
  position            text,
  department_id       uuid references departments(id),
  supervisor_id       uuid references employees(id),
  employment_type     text default 'regular',    -- regular, probationary, contractual, part_time
  employment_status   text default 'active',     -- active, inactive, resigned, terminated
  date_hired          date,
  basic_pay           numeric(12,2) default 0,
  -- Government IDs
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

-- Add head_employee FK now that employees table exists
alter table departments
  add constraint fk_dept_head
  foreign key (head_employee_id) references employees(id)
  on delete set null;

-- ── Users (login accounts) ───────────────────────────────────────────────────
create table if not exists users (
  id              uuid primary key default uuid_generate_v4(),
  email           text unique not null,
  password_hash   text not null,
  full_name       text not null,
  phone           text,
  roles           text[] default array['employee'],
  is_active       boolean default true,
  employee_id     uuid references employees(id),
  company_id      uuid references companies(id),
  last_login      timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── Payroll Entries ──────────────────────────────────────────────────────────
create table if not exists payroll_entries (
  id               uuid primary key default uuid_generate_v4(),
  employee_id      text not null references employees(employee_id),
  period           text not null,               -- e.g. 'January 2025'
  basic_pay        numeric(12,2) default 0,
  overtime_pay     numeric(12,2) default 0,
  allowances       numeric(12,2) default 0,
  gross_pay        numeric(12,2) default 0,
  -- Employee deductions
  sss_ee           numeric(10,2) default 0,
  philhealth_ee    numeric(10,2) default 0,
  pagibig_ee       numeric(10,2) default 0,
  withholding_tax  numeric(12,2) default 0,
  other_deductions numeric(12,2) default 0,
  total_deductions numeric(12,2) default 0,
  net_pay          numeric(12,2) default 0,
  -- Employer shares (for reporting)
  sss_er           numeric(10,2) default 0,
  philhealth_er    numeric(10,2) default 0,
  pagibig_er       numeric(10,2) default 0,
  -- Approval workflow
  status           text default 'draft',       -- draft, pending_approval, released
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
  employee_id  text not null references employees(employee_id),
  date         date not null,
  time_in      time,
  time_out     time,
  status       text default 'present',   -- present, absent, late, half_day, on_leave
  notes        text,
  logged_by    uuid references users(id),
  created_at   timestamptz default now(),
  unique(employee_id, date)
);

-- ── Leave Requests ───────────────────────────────────────────────────────────
create table if not exists leave_requests (
  id                uuid primary key default uuid_generate_v4(),
  employee_id       text not null references employees(employee_id),
  leave_type        text not null,             -- sick, vacation, emergency, maternity, paternity
  start_date        date not null,
  end_date          date not null,
  days_count        int default 1,
  reason            text,
  status            text default 'pending',    -- pending, approved, rejected
  approved_by       uuid references users(id),
  approval_remarks  text,
  approved_at       timestamptz,
  created_at        timestamptz default now()
);

-- ── Leave Balances ───────────────────────────────────────────────────────────
create table if not exists leave_balances (
  id           uuid primary key default uuid_generate_v4(),
  employee_id  text not null references employees(employee_id),
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

-- ── Indexes for performance ───────────────────────────────────────────────────
create index if not exists idx_employees_status    on employees(employment_status);
create index if not exists idx_employees_dept      on employees(department_id);
create index if not exists idx_payroll_period      on payroll_entries(period);
create index if not exists idx_payroll_employee    on payroll_entries(employee_id);
create index if not exists idx_attendance_date     on attendance(date);
create index if not exists idx_attendance_employee on attendance(employee_id);
create index if not exists idx_leave_employee      on leave_requests(employee_id);
create index if not exists idx_leave_status        on leave_requests(status);
create index if not exists idx_logs_user           on activity_logs(user_id);
create index if not exists idx_logs_created        on activity_logs(created_at);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- We use service role key from backend so RLS doesn't block API calls.
-- Enable RLS on sensitive tables for direct client access protection.
alter table users           enable row level security;
alter table payroll_entries enable row level security;
alter table employees       enable row level security;

-- Service role bypasses RLS automatically — no policies needed for backend.
-- Add policies here only if you use Supabase client-side auth directly.

-- ── Seed: default admin user (change password immediately after first login) ──
-- Password: NumaAdmin2024! (bcrypt hash)
insert into users (email, password_hash, full_name, roles, is_active)
values (
  'admin@numahris.ph',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniMKmCFVMmLSCMwjEJbDBuFWi',
  'NUMA Admin',
  array['admin','hr','hr_manager','payroll_officer','employee'],
  true
) on conflict (email) do nothing;
