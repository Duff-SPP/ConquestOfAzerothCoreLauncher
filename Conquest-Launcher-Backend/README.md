# Independent launcher backend

Use [BUILD_AND_RELEASE.md](../BUILD_AND_RELEASE.md) and [PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md) as the current primary guides.

.NET 8. Production runs framework-dependent Linux output with ASP.NET Core 8. Account registration supports Turnstile disabled; validation and rate limits remain. Discord account linking uses backend-only OAuth secrets and the SQL/grants documented in the deployment guide. A basic SRP account deployment can use this backend alone. The original 0.8.1 deployment instead proxies authentication/account requests to a separate website. The standalone handler does not validate TOTP/recovery codes: do not expose it for accounts requiring 2FA. See ../docs/AUTHENTICATION.md.

For the launcher issue fixes dated 2026-09-28, reapply `sql/discord-account-link.sql` to the configured auth database before deploying the backend. It adds `coa_discord_pending` without replacing existing link records. Grant the backend database user SELECT, INSERT, UPDATE and DELETE on that table (see `sql/launcher-user.example.sql`; adapt the user/host to the deployment). Pending OAuth requests then survive a backend restart and remain single-use. Requests started by the old in-memory implementation must be restarted once.

Existing launcher cookies without a credential stamp require a fresh login after deployment. New cookies are checked against the account's current salt/verifier on every authenticated request, so changing the password also invalidates launcher sessions, including password changes performed outside this backend.

Do not reuse historical deployment archives. Never package appsettings.Local.json. Keep local credentials private.
