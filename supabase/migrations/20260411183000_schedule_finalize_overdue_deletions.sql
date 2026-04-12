CREATE OR REPLACE FUNCTION public.schedule_finalize_overdue_deletions_job(
  p_schedule text DEFAULT '0 3 * * *'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id bigint;
BEGIN
  PERFORM public.unschedule_finalize_overdue_deletions_job();

  SELECT cron.schedule(
    'finalize-overdue-deletions-daily',
    p_schedule,
    $cron$SELECT public.invoke_finalize_overdue_deletions('pg_cron', 25);$cron$
  )
  INTO v_job_id;

  RETURN v_job_id;
END;
$$;