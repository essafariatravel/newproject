-- Candidate only: no claim that existing rules have been officially verified.
alter table visa_types add column rule_version integer not null default 1 check(rule_version>0);
alter table visa_types add column rule_governance jsonb not null default '{}'::jsonb check(jsonb_typeof(rule_governance)='object');
alter table applications add column visa_rule_snapshot jsonb;

create function increment_visa_rule_version() returns trigger language plpgsql as $$
begin
  new.rule_version:=old.rule_version+1;
  -- A review applies to the reviewed bytes, not subsequent product edits.
  if (to_jsonb(new)-array['rule_version','rule_governance','updated_at']) is distinct from
     (to_jsonb(old)-array['rule_version','rule_governance','updated_at']) then
    new.rule_governance:=(old.rule_governance-array['reviewedAt','reviewerId'])||jsonb_build_object('state','STALE');
  end if;
  return new;
end $$;
create trigger visa_rule_version before update on visa_types for each row execute function increment_visa_rule_version();

create function snapshot_application_visa_rule() returns trigger language plpgsql as $$
declare captured jsonb;
begin
  if tg_op='UPDATE' then
    if new.visa_rule_snapshot is distinct from old.visa_rule_snapshot then raise exception 'Historical visa rule snapshot is immutable'; end if;
    return new;
  end if;
  select jsonb_build_object('version',v.rule_version,'countryId',v.country_id,'programmeId',v.id,'programmeCode',v.code,'governance',v.rule_governance,
    'capturedAt',now(),'fee',v.fee,'currency',v.currency,'embassyApplicability',v.embassy_applicability,
    'requirements',coalesce((select jsonb_agg(jsonb_build_object('documentTypeId',r.document_type_id,'required',r.required,'notes',r.notes) order by r.sort_order,r.id) from visa_requirements r where r.visa_type_id=v.id and r.active),'[]'::jsonb))
    into captured from visa_types v where v.id=new.visa_type_id;
  new.visa_rule_snapshot:=captured;
  return new;
end $$;
create trigger application_visa_rule_snapshot before insert or update on applications for each row execute function snapshot_application_visa_rule();

create function bump_requirement_rule_version() returns trigger language plpgsql as $$
begin
  if tg_op<>'INSERT' then update visa_types set updated_at=now(),rule_governance=(rule_governance-array['reviewedAt','reviewerId'])||jsonb_build_object('state','STALE') where id=old.visa_type_id; end if;
  if tg_op='INSERT' or (tg_op='UPDATE' and new.visa_type_id<>old.visa_type_id) then update visa_types set updated_at=now(),rule_governance=(rule_governance-array['reviewedAt','reviewerId'])||jsonb_build_object('state','STALE') where id=new.visa_type_id; end if;
  return null;
end $$;
create trigger requirement_rule_version after insert or update or delete on visa_requirements for each row execute function bump_requirement_rule_version();
do $$ declare app_schema text:=current_schema(); begin
  execute format('alter function %I.increment_visa_rule_version() set search_path to pg_catalog, %I',app_schema,app_schema);
  execute format('alter function %I.snapshot_application_visa_rule() set search_path to pg_catalog, %I',app_schema,app_schema);
  execute format('alter function %I.bump_requirement_rule_version() set search_path to pg_catalog, %I',app_schema,app_schema);
  execute format('revoke all on function %I.increment_visa_rule_version() from public',app_schema);
  execute format('revoke all on function %I.snapshot_application_visa_rule() from public',app_schema);
  execute format('revoke all on function %I.bump_requirement_rule_version() from public',app_schema);
end $$;

create index communications_history_cursor_idx on communications(application_id,created_at desc,id desc);
create index notifications_user_history_idx on notifications(user_id,created_at desc,id desc);
create index wallet_agency_history_idx on wallet_transactions(agency_id,created_at desc,id desc);
create index audit_actor_security_idx on audit_logs(entity,entity_id,created_at desc,id desc);
