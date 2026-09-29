const fs = require('node:fs/promises');

class Portal {
  constructor(baseUrl, { fetchImpl = fetch, sessionFile, encrypt, decrypt, allowLocalHttp = false, cookieName = 'coa_portal' } = {}) {
    this.base = new URL(baseUrl);
    if (this.base.protocol !== 'https:' && !(allowLocalHttp && this.base.hostname === '127.0.0.1')) throw new Error('Account services require HTTPS.');
    this.fetch = fetchImpl; this.file = sessionFile; this.encrypt = encrypt; this.decrypt = decrypt; this.cookie = ''; this.loaded = false;
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
  async request(endpoint, body) {
    await this.load();
    const response = await this.fetch(new URL(endpoint, this.base), {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Accept: 'application/json', 'X-CoA-Request': '1', ...(this.cookie ? { Cookie: this.cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    // Only this fixed HTTPS portal receives the cookie; it never crosses the renderer bridge.
    const cookies = response.headers.getSetCookie?.() || [];
    const portalCookies = cookies.map(value => value.split(';')[0]).filter(value => this.cookiePattern.test(value));
    if (portalCookies.length) {
      this.cookie = portalCookies.filter(value => !value.endsWith('=')).join('; ');
      if (this.file && this.encrypt) {
        try {
          await fs.writeFile(this.file + '.tmp', this.encrypt(this.cookie), { mode: 0o600 });
          await fs.rename(this.file + '.tmp', this.file);
          this.persistenceWarning = '';
        } catch {
          this.persistenceWarning = 'Signed in for this launcher session only. Windows could not save your sign-in securely.';
          await fs.unlink(this.file).catch(() => {});
          await fs.unlink(this.file + '.tmp').catch(() => {});
        }
      }
    }
    let data = null; try { data = await response.json(); } catch {}
    if (!response.ok) {
      if (response.status === 401) { this.cookie = ''; if (this.file) await fs.unlink(this.file).catch(() => {}); }
      const error = new Error(response.status === 401 ? 'Please sign in with your game account.' : response.status === 429 ? 'Too many attempts. Please try again later.' : data?.message || `Account service returned HTTP ${response.status}.`);
      error.status = response.status; throw error;
    }
    return data;
  }
  async login(login, password) {
    if (typeof login !== 'string' || !login.trim() || login.length > 254 || typeof password !== 'string' || !password || password.length > 128) throw new Error('Enter your account name/email and password.');
    const configuration = await this.request('/api/site-config');
    if (configuration?.previewMode) throw new Error('The website is in preview mode. The server owner needs to enable production accounts.');
    await this.request('/api/auth/login', { login: login.trim(), password });
    return this.account();
  }
  async register(username, email, password, confirmPassword, acceptTestWarning) {
    if (typeof username !== 'string' || !username.trim() || username.length > 64) throw new Error('Enter an account name.');
    if (typeof email !== 'string' || !email.trim() || email.length > 254) throw new Error('Enter a valid email address.');
    if (typeof password !== 'string' || !password || password.length > 128 || typeof confirmPassword !== 'string' || !confirmPassword) throw new Error('Enter and confirm your password.');
    if (acceptTestWarning !== true) throw new Error('Confirm that you understand this is a public test realm.');
    const configuration = await this.request('/api/site-config');
    if (!configuration?.registrationEnabled) throw new Error('Account registration is currently unavailable.');
    // PTR registration uses no CAPTCHA; fail closed if an operator enables one.
    if (configuration?.turnstileEnabled) throw new Error('Human verification is not connected to the desktop launcher yet.');
    return this.request('/api/register', {
      username: username.trim(),
      email: email.trim(),
      password,
      confirmPassword,
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
    try { await this.request('/api/auth/logout', {}); }
    finally { this.cookie = ''; if (this.file) await fs.unlink(this.file).catch(() => {}); }
  }
}
module.exports = { Portal };
