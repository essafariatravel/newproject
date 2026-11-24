-- Additive cancellation workflow. Historical dossiers and wallet entries are not rewritten.
CREATE TABLE application_cancellation_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
 origin text NOT NULL CHECK (origin IN ('AGENCY','STAFF')),
 status text NOT NULL CHECK (status IN ('PENDING','APPROVED','REFUSED')),
 requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
 request_reason text NOT NULL CHECK (length(btrim(request_reason)) BETWEEN 8 AND 1000),
 requested_at timestamptz NOT NULL DEFAULT now(),
 decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
 decided_at timestamptz,
 decision_reason text,
 refund_amount numeric(14,2),
 wallet_transaction_id uuid,
 price_adjustment_id uuid,
 CHECK (origin <> 'STAFF' OR status = 'APPROVED'),
 CHECK (
   (status = 'PENDING' AND decided_at IS NULL AND decision_reason IS NULL AND refund_amount IS NULL AND wallet_transaction_id IS NULL AND price_adjustment_id IS NULL)
   OR (status = 'REFUSED' AND decided_at IS NOT NULL AND decision_reason IS NOT NULL AND length(btrim(decision_reason)) BETWEEN 8 AND 1000 AND refund_amount IS NULL AND wallet_transaction_id IS NULL AND price_adjustment_id IS NULL)
   OR (status = 'APPROVED' AND decided_at IS NOT NULL AND decision_reason IS NOT NULL AND length(btrim(decision_reason)) BETWEEN 8 AND 1000 AND refund_amount IS NOT NULL AND refund_amount >= 0 AND
       ((refund_amount = 0 AND wallet_transaction_id IS NULL AND price_adjustment_id IS NULL) OR
        (refund_amount > 0 AND wallet_transaction_id IS NOT NULL AND price_adjustment_id IS NOT NULL)))
 )
);
CREATE UNIQUE INDEX application_cancellation_one_active ON application_cancellation_requests(application_id)
 WHERE status IN ('PENDING','APPROVED');
CREATE INDEX application_cancellation_history ON application_cancellation_requests(application_id, requested_at DESC);
ALTER TABLE application_cancellation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON application_cancellation_requests FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE application_cancellation_requests IS 'Private application cancellation decisions. Monetary entries are immutable references recorded in the existing price-adjustment and wallet ledgers.';

-- Prevent older deployed clients or any routine workflow from bypassing the
-- atomic cancellation/credit service. Existing cancelled dossiers stay intact.
CREATE FUNCTION enforce_application_cancellation_workflow() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $cancel_guard$
DECLARE old_code text; new_code text; new_terminal boolean; pending boolean; approved boolean;
BEGIN
 IF NEW.status_id IS NOT DISTINCT FROM OLD.status_id THEN RETURN NEW; END IF;
 EXECUTE format('SELECT code FROM %I.statuses WHERE id=$1',TG_TABLE_SCHEMA) INTO old_code USING OLD.status_id;
 EXECUTE format('SELECT code,is_terminal FROM %I.statuses WHERE id=$1',TG_TABLE_SCHEMA) INTO new_code,new_terminal USING NEW.status_id;
 IF OLD.submitted_at IS NULL THEN RETURN NEW; END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.application_cancellation_requests WHERE application_id=$1 AND status=''PENDING''), EXISTS(SELECT 1 FROM %I.application_cancellation_requests WHERE application_id=$1 AND status=''APPROVED'')',TG_TABLE_SCHEMA,TG_TABLE_SCHEMA)
 INTO pending,approved USING OLD.id;
 IF (old_code='CANCELLED' AND approved) OR
    (new_code='CANCELLED' AND NOT approved) OR
    (pending AND new_terminal) THEN
  RAISE EXCEPTION 'Use the cancellation decision workflow before closing this application' USING ERRCODE='23514', CONSTRAINT='application_cancellation_workflow';
 END IF;
 RETURN NEW;
END
$cancel_guard$;
REVOKE ALL ON FUNCTION enforce_application_cancellation_workflow() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER application_cancellation_workflow BEFORE UPDATE OF status_id ON applications
 FOR EACH ROW EXECUTE FUNCTION enforce_application_cancellation_workflow();
