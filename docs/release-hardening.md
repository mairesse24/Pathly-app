# Release hardening follow-ups

Recorded August 22, 2026 after the production security audit for Supabase project `qyteadrlrsjuhtwggayk`.

## Deferred platform item

- Enable Supabase Auth leaked-password protection after upgrading from the current Free plan to a plan that provides it. This is a platform setting, not an application-code fix.

## Intentional advisor findings

- `canvas_credentials`, `canvas_oauth_states`, `google_calendar_credentials`, and `google_calendar_oauth_states` have RLS enabled with no client policies because they are server-only tables whose grants are revoked from `anon` and `authenticated`.
- `resolve_syllabus_exam_conflict` remains an authenticated `SECURITY DEFINER` RPC. Its owner checks and restricted purpose were reviewed previously; do not change it merely to silence the advisor.

## Migration-history drift

The audit compared 47 repository migration files with 46 live migration-history entries and found 43 historical filename/version mismatches, plus name differences for several migrations that were applied through earlier tooling. The new `harden_canvas_owner_foreign_keys` migration is aligned to its live recorded version (`20260822025219`).

Do not rename old committed migrations or rewrite production migration history during release stabilization. Reconcile the historical baseline as a separate, planned database-maintenance task after v1.0.0.
