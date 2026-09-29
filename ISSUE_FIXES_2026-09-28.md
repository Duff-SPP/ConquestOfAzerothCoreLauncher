# Launcher issue fixes — 2026-09-28

Changes apply to `conquest-launcher` version 0.6.8 and `Conquest-Launcher-Backend` in this directory. No packaged executable, deployment output, archive or live database was modified. Original changed files are preserved in `../issue-fix-backup-20260928`.

| Issue | Change |
| --- | --- |
| Launcher self-update blocked by client checks | Restart checks only whether a client operation is active; it does not inspect client paths or game processes. |
| Unrelated games block operations | Windows game detection compares executable directories with the selected client directory. The destination is also checked when selecting a new folder. |
| Password reset leaves sessions valid | Signed cookies carry a credential stamp validated against the current account salt/verifier on each authenticated request. Legacy cookies require login again. |
| Orphan staging files | Recovery removes numbered stage files when no transaction exists, and removes leftover stage files after completing transaction recovery. |
| Old partial downloads | Client planning deletes launcher-owned SHA-256 `.part` files absent from the selected manifest, preserving resumable downloads for that manifest. |
| Login succeeds but secure persistence fails | Authentication stays usable in memory, and the account UI explains that secure sign-in persistence failed. |
| Realm setup replaces other settings | Only realmlist directives are replaced; unrelated lines and their newline style are retained. Existing backup behavior remains. |
| Unavailable client path breaks startup | Client info returns an unavailable state and a diagnostic instead of throwing on filesystem access failures. |
| HTTP 429 blocks offline play | Rate limiting permits the existing cached-manifest fallback, which fully verifies client hashes before launch. |
| Manually started game shows Play | Bootstrap, focus refresh and periodic refresh inspect the selected client's process path. |
| Discord linking lost on restart | Pending state is stored as a digest in MySQL with an expiry; transactional consumption prevents reuse. |
| Addon browsing hashes large installations | Normal inventory reads folder/TOC metadata. Explicit Rescan verifies file hashes; install/repair/uninstall verification remains. |
| Demo folder selection stays stale | Renderer immediately stores the selected path returned by the main process. |
| Stale changelog version | Heading uses the package version from bootstrap. |
| Hard-coded realm hostname | Settings displays the configured realm hostname. |
| Malformed settings silently reset | The malformed file is backed up and a visible recovery message explains the reset. |
| rememberClient ignored | Disabling it keeps the selection for this session but writes an empty path to disk and does not restore a path on next startup. |
| Launcher updater loses diagnostics | Catch handling retains the actual updater error message. |

## Deployment

Before deploying the backend, apply `Conquest-Launcher-Backend/sql/discord-account-link.sql` to the configured auth database and grant SELECT, INSERT, UPDATE, DELETE on `coa_discord_pending` to the actual backend user. The example grant is included in `sql/launcher-user.example.sql`; do not recreate or replace a production user's password from that example. Existing OAuth attempts from before this change need to be restarted once.

The backend and launcher must be packaged/deployed separately by the normal release process. No version bump or compilation was requested or performed.

## Verification

Focused source review and `node --check` for the ten changed JavaScript files. No test suite, .NET build, Electron build, live database migration, or live OAuth test was run.

API references: [ASP.NET Core cookie principal validation](https://github.com/dotnet/AspNetCore.Docs/blob/main/aspnetcore/security/authentication/cookie.md), [PowerShell Get-CimInstance](https://learn.microsoft.com/en-us/powershell/module/cimcmdlets/get-ciminstance?view=powershell-5.1).
