-- Explicit release step after owner resolution of identity conflicts.
-- No account is changed, merged or deleted. Any conflict aborts the transaction.
begin;
do $$ begin
  if current_schema() not in ('visa_os','visa_os_preview','hotfix_guard_test') then
    raise exception 'HOTFIX_IDENTITY_SCHEMA_NOT_APPROVED';
  end if;
end $$;
lock table users in share row exclusive mode;
do $$ begin
  if exists(select 1 from users where status='ACTIVE' and agency_id is not null group by agency_id having count(*)>1) then
    raise exception 'HOTFIX_AGENCY_ACCOUNT_CONFLICT';
  end if;
  if exists(select 1 from users where status='ACTIVE' group by lower(btrim(email)) having count(*)>1) then
    raise exception 'HOTFIX_LOGIN_EMAIL_CONFLICT';
  end if;
end $$;
create unique index if not exists users_one_active_agency_hotfix on users(agency_id)
  where agency_id is not null and status='ACTIVE';
create unique index if not exists users_active_login_email_hotfix on users(lower(btrim(email))) where status='ACTIVE';
commit;
