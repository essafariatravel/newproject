-- Phase 2.2 §11 — first-login forced password change (idempotent)
alter table users
  add column if not exists must_change_password boolean not null default false;

comment on column users.must_change_password is 'When true, every authenticated page/action (except the password change itself) is blocked until the user sets a new password.';
