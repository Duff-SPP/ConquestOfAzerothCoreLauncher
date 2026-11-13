# Launcher authentication contract

Authentication is performed by a trusted HTTPS service; the Electron renderer never receives the session cookie. Requests include `X-CoA-Request: 1`. The configured host and any reverse-proxy Host handling must match the authentication service's expectations.

- `POST /api/auth/login`: JSON `login`, `password`, optional string `code` (authenticator or recovery code). Account name or email may be accepted by the provider.
- Success: HTTP200 `{ "username": "PLAYER" }` and the HttpOnly/Secure `coa_launcher` cookie. The launcher then validates `GET /api/auth/session`.
- Missing/wrong second factor: HTTP403 `{ "twoFactorRequired": true, "message": "..." }`, with no authenticated cookie issued. Return this only after validating the password. Wrong credentials may return403 without that flag. Rate limiting returns429.
- `GET /api/auth/session`: HTTP200 with account identity, including username; HTTP401 when expired/revoked.
- `POST /api/auth/logout`: revoke/clear the launcher session.
- Account features also consume `/api/account/overview`, `/api/account/characters`, and optional Discord account endpoints. Providers may report unavailable optional integrations rather than granting them.

The original website issues a persistent sliding30-day cookie and validates a security stamp. Its V2.50 handler validates OTP/recovery codes. There is no remember-me request field; the launcher decides whether to persist the cookie with Electron system encryption. Game auto-login additionally needs the player's credentials and explicit preference; a cookie is not a substitute for a game password, and game TOTP can still prompt separately.

**Important deployment boundary:** website authentication is external and not included here. The bundled backend's standalone login verifies the SRP password only and is not a TOTP provider. Do not route accounts requiring TOTP to that legacy handler. This publication preserves the existing source and does not silently change authentication/database behavior.
