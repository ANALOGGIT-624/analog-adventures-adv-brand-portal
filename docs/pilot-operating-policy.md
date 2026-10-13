# Pilot operating policy

Recorded October 12, 2026, following Thomas's explicit approval.

## Scope and ownership

The next pilot step is a rehearsal on `analog-adventures-test.myshopify.com`,
the separate development store used for workflow and recovery testing. A live-store
launch remains a separate installation and configuration exercise.

Thomas owns backup alerts, recovery-key custody, and credential renewals.
The recovery decryption key is held in Apple Passwords; Thomas confirmed it is
available on other devices. Never copy that key into Git, Render, or Backblaze.
Record any future transfer of these responsibilities before the current owner
becomes unavailable.

## Retention policy and implementation status

The approved policy is 30 days of daily backups and 12 monthly recovery copies.
The initial approval recorded policy only. On October 13, Thomas separately
approved enabling Object Lock and a 30-day default for new uploads; the
Backblaze dashboard now confirms Default 30 Days. Monthly selection and
automatic expiration remain unimplemented. Existing files are not retroactively
locked. No backup deletion is authorized by this policy.
Existing backups must remain intact while those controls are prepared.
See the [retention rollout plan](backup-retention-rollout.md) for implementation
gates and why a bucket-wide expiration rule is insufficient.

A recovery copy must include the paired PostgreSQL and Shopify/R2 archives,
manifests, integrity evidence, and the known-gap report. Select a verified pair
for each monthly copy; keep at least one earlier verified recovery point when
a newer backup introduces gaps. Do not apply a bucket-wide expiration rule:
daily and monthly copies need distinct retention treatment. Long-term retention
of approved artwork and business records needs a separate business decision;
backup expiration must never be treated as permission to delete active records.

The daily job runs at 08:00 UTC (4 a.m. Eastern daylight time, 3 a.m. Eastern
standard time). With successful daily runs, the interval between offsite captures
is approximately 24 hours; failures can extend it. A 15-minute data-loss target
and four-hour recovery target have not been established by these tests.

## Credential renewal procedure

| Credential | Current expiration | Owner |
| --- | --- | --- |
| Active app R2 credential | November 11, 2026 | Thomas |
| Backup R2 read-only credential | December 28, 2026 | Thomas |
| Scheduled Backblaze credential | December 28, 2026 | Thomas |

Rotate the active app R2 credential before November 11. For each renewal:

1. Identify the exact consumer and existing bucket/prefix permissions without
   exposing the secret. Create a replacement with only the required access.
2. Save it in that consumer's private settings and deploy/restart as required.
3. For the app, verify an authorized artwork upload and customer download. For
   backup credentials, run the combined backup and verify encrypted read-back
   using the appropriate restore access. Confirm monitoring receives success.
4. Revoke the old credential only after the replacement passes. Record the new
   expiry and verification evidence without recording secret values.

Recording this policy created no credentials. Subsequently, on October 12,
Thomas created the replacement and approved saving it in Render. The deployed
app's fresh customer download was confirmed to use the new key and matched the
original artwork bytes. The old October 24 key was revoked October 13; a fresh customer download
using the replacement still matched the original artwork.
This document does not create reminders or scheduled renewal automation.

## Rehearsal gates still to close

- Prepare and verify retention implementation without pruning existing copies.
- Renew the active R2 credential before November 11.
- Review and explicitly accept or resolve the thirteen historical test-data
  gaps. Acceptance of a limited backup baseline is not acceptance for launch.
- Add a distinct missed-order-reconciliation-run alert; backup success alone
  does not prove order reconciliation ran. Until then, inspect its last-run
  status before and after each rehearsal session.
- Preserve the October 12 staff-download evidence qualification: the saved file
  matched, but browser download-event capture timed out. The customer download
  and hosted navigation checks passed.
- Review the remaining reliability/security findings and define the rehearsal
  participants and success criteria before treating it as a pilot sign-off.
- Confirm cleanup of temporary recovery resources. The October 12 web service
  and database are suspended, not deleted; no final billing total is verified.
  Any permanent deletion needs exact resource identification and approval.

See [the recovery evidence](pilot-resumption-20261012.md),
[backup procedures](backup-and-recovery.md), and
[reliability review](reliability-review-20261009.md).
