-- Enforce deal locking at the database level so a malicious or buggy client
-- cannot bypass the client-side `isLocked` guard by writing directly to the
-- table. When a deal has is_locked = true we reject any UPDATE that touches
-- a column other than is_locked itself (so the user can still unlock the deal).
-- DELETEs on locked deals are rejected as well.

CREATE OR REPLACE FUNCTION public.enforce_deal_lock()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_locked = TRUE THEN
      RAISE EXCEPTION 'Deal is locked and cannot be deleted (id=%).', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE path: allow only the unlock toggle while locked.
  IF OLD.is_locked = TRUE THEN
    IF NEW.is_locked = FALSE
       AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) -- something actually changed
       AND ROW(NEW.id, NEW.is_locked) = ROW(OLD.id, FALSE)
       AND ROW(
             NEW.address_full, NEW.address_street, NEW.address_city,
             NEW.address_state, NEW.address_zip, NEW.status, NEW.source,
             NEW.api_data, NEW.financials, NEW.overrides, NEW.notes,
             NEW.rejection_reason, NEW.scout_ai_data, NEW.email_extracted_data,
             NEW.email_subject, NEW.email_date, NEW.email_id,
             NEW.gmail_message_id, NEW.analyzed_at, NEW.created_by
           ) IS NOT DISTINCT FROM ROW(
             OLD.address_full, OLD.address_street, OLD.address_city,
             OLD.address_state, OLD.address_zip, OLD.status, OLD.source,
             OLD.api_data, OLD.financials, OLD.overrides, OLD.notes,
             OLD.rejection_reason, OLD.scout_ai_data, OLD.email_extracted_data,
             OLD.email_subject, OLD.email_date, OLD.email_id,
             OLD.gmail_message_id, OLD.analyzed_at, OLD.created_by
           )
    THEN
      RETURN NEW; -- pure unlock, allow it
    END IF;

    RAISE EXCEPTION 'Deal is locked and cannot be modified (id=%). Unlock first.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_deal_lock_trigger ON public.deals;

CREATE TRIGGER enforce_deal_lock_trigger
BEFORE UPDATE OR DELETE ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.enforce_deal_lock();
