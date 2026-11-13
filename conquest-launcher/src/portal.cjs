// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
const fs = require('node:fs/promises');

class Portal {
  #gameLogin = null;
  #gameLoginVersion = 0;
  clearGameLogin() { this.#gameLogin = null; this.#gameLoginVersion++; }
  getGameLogin() { return this.#gameLogin; }
  constructor(baseUrl, { fetchImpl = fetch, sessionFile, encrypt, decrypt, allowLocalHttp = false, cookieName = 'coa_portal' } = {}) {
    this.base = new URL(baseUrl);
    if (this.base.protocol !== 'https:' && !(allowLocalHttp && this.base.hostname === '127.0.0.1')) throw new Error('Account services require HTTPS.');
    this.fetch = fetchImpl; this.file = sessionFile; this.encrypt = encrypt; this.decrypt = decrypt; this.cookie = ''; this.loaded = false;
    this.saveQueue = Promise.resolve(); this.rememberSession = true;
    if (!/^[a-z_]+$/.test(cookieName)) throw new Error('Invalid session cookie name.');
    this.cookiePattern = new RegExp(`^${cookieName}(?:C\\d+)?=`);
  }
  async load() {
    if (!this.loading) this.loading = (async () => {
      if (this.file) {
        try { this.cookie = this.decrypt(await fs.readFile(this.file)); } catch { this.cookie = ''; }
      }
      this.loaded = true;
    })();
    return this.loading;
  }
  queueSessionWrite(action) {
    const pending = this.saveQueue.then(action);
    this.saveQueue = pending.catch(() => {});
    return pending;
  }
  async request(endpoint, body) {
    await this.load();
    const response = await this.fetch(new URL(endpoint, this.base), {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(20000),
      headers: { Accept: 'application/json', 'X-CoA-Request': '1', ...(this.cookie ? { Cookie: this.cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    // Only this fixed HTTPS portal receives the cookie; it never crosses the renderer bridge.
    // Electron joins Set-Cookie headers; split cookie boundaries, not Expires dates.
    let data = null; try { data = await response.json(); } catch {}
    const twoFactorRequired = response.status === 403 && data?.twoFactorRequired === true;
    const cookies = (twoFactorRequired ? [] : response.headers.getSetCookie?.() || []).flatMap(value => value.split(/,(?=\s*[^=;,\s]+=)/).map(cookie => cookie.trim()));
    const portalCookies = cookies.map(value => value.split(';')[0]).filter(value => this.cookiePattern.test(value));
    if (portalCookies.length) {
      this.cookie = portalCookies.filter(value => !value.endsWith('=')).join('; ');
      if (this.file && this.encrypt && this.rememberSession) {
        const cookie = this.cookie;
        await this.queueSessionWrite(async () => {
          try {
            await fs.writeFile(this.file + '.tmp', this.encrypt(cookie), { mode: 0o600 });
            await fs.rename(this.file + '.tmp', this.file);
            this.persistenceWarning = '';
          } catch {
            this.persistenceWarning = 'Signed in for this launcher session only. Windows could not save your sign-in securely.';
            await fs.unlink(this.file).catch(() => {});
            await fs.unlink(this.file + '.tmp').catch(() => {});
          }
        });
      }
    }
    if (!response.ok) {
      if (response.status === 401) { this.clearGameLogin(); this.cookie = ''; if (this.file) await this.queueSessionWrite(() => fs.unlink(this.file).catch(() => {})); }
      const error = new Error(response.status === 401 ? 'Please sign in with your game account.' : response.status === 429 ? 'Too many attempts. Please try again later.' : data?.message || `Account service returned HTTP ${response.status}.`);
      error.status = response.status; error.twoFactorRequired = twoFactorRequired; throw error;
    }
    return data;
  }
  async login(login, password, { rememberForGame = false, code, rememberSession = true } = {}) {
    this.clearGameLogin();
    const version = this.#gameLoginVersion;
    if (typeof login !== 'string' || !login.trim() || login.length > 254 || typeof password !== 'string' || !password || password.length > 128) throw new Error('Enter your account name/email and password.');
    this.rememberSession = rememberSession !== false;
    if (!this.rememberSession && this.file) await this.queueSessionWrite(() => fs.unlink(this.file).catch(() => {}));
    const configuration = await this.request('/api/site-config');
    if (configuration?.previewMode) throw new Error('The website is in preview mode. The server owner needs to enable production accounts.');
    if (code !== undefined && (typeof code !== 'string' || !code.trim() || code.length > 256)) throw new Error('Enter your authenticator or recovery code.');
    try {
      await this.request('/api/auth/login', { login: login.trim(), password, ...(code === undefined ? {} : { code: code.trim() }) });
    } catch (error) {
      if (error.twoFactorRequired) return { twoFactorRequired: true, message: error.message };
      throw error;
    }
    const account = await this.account();
    if (rememberForGame === true && version === this.#gameLoginVersion && typeof account?.username === 'string' && account.username) {
      this.#gameLogin = { username: account.username, password };
    }
    return account;
  }
  async register(username, email, password, confirmPassword, acceptTestWarning) {
    if (typeof username !== 'string' || !username.trim() || username.length > 64) throw new Error('Enter an account name.');
    if (typeof email !== 'string' || !email.trim() || email.length > 254) throw new Error('Enter a valid email address.');
    if (typeof password !== 'string' || !password || password.length > 128 || typeof confirmPassword !== 'string' || !confirmPassword) throw new Error('Enter and confirm your password.');
    if (acceptTestWarning !== true) throw new Error('Confirm that you understand this account is for the live and PTR realms.');
    const configuration = await this.request('/api/site-config');
    if (!configuration?.registrationEnabled) throw new Error('Account registration is currently unavailable.');
    // Desktop registration supports CAPTCHA disabled; fail closed if an operator enables one.
    if (configuration?.turnstileEnabled) throw new Error('Human verification is not connected to the desktop launcher yet.');
    return this.request('/api/register', {
      username: username.trim(),
      email: email.trim(),
      password,
      confirmPassword,
      // Keep the existing API field for compatibility with deployed launchers/backends.
      acceptTestWarning: true,
      turnstileToken: '',
      website: ''
    });
  }
  async account() {
    try { const account = await this.request('/api/auth/session'); return account ? { ...account, persistenceWarning: this.persistenceWarning || '' } : account; }
    catch (error) { if (error.status === 401) return null; throw error; }
  }
  async overview() {
    return this.request('/api/account/overview');
  }
  async characters() {
    return this.request('/api/account/characters');
  }
  async discordLinkStatus() {
    return this.request('/api/account/discord');
  }
  async startDiscordLink() {
    return this.request('/api/account/discord/start', {});
  }
  async unlinkDiscord() {
    return this.request('/api/account/discord/unlink', {});
  }
  async logout() {
    this.clearGameLogin();
    try { await this.request('/api/auth/logout', {}); }
    finally { this.cookie = ''; if (this.file) await this.queueSessionWrite(() => fs.unlink(this.file).catch(() => {})); }
  }
}
module.exports = { Portal };
