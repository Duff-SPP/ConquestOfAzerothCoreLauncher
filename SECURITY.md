# Security and private configuration

Do not put credentials, database dumps, authentication/data-protection keys,
client-session files, private game clients or signing certificates in this
repository. Public service URLs and guild IDs in launcher.config.json are not
credentials. Review `.gitignore` and the actual staged files before committing.

The repository includes configuration examples only. The separate website that
handles the original deployment's login/2FA is not included. Read
`docs/AUTHENTICATION.md` before exposing authentication endpoints; the legacy
standalone backend login does not perform TOTP verification.

Do not post real passwords, connection strings, recovery codes, cookies or
private keys in GitHub issues or screenshots. Use the repository's private
security reporting mechanism if enabled; otherwise contact the repository owner
privately before disclosing an exploitable issue. Do not probe production
accounts to demonstrate a source finding.
