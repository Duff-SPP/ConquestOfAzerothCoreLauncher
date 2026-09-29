'use strict';
const content = document.getElementById('content');
const message = document.getElementById('message');
let configuration; let account; let captchaTimer; let captchaWidget;
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
async function request(route, body) {
  const response = await fetch(route, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: { 'X-CoA-Request': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let data; try { data = await response.json(); } catch {}
  if (!response.ok) { const error = new Error(data?.message || (response.status === 401 ? 'Sign in with your game account.' : response.status === 429 ? 'Too many attempts. Please wait and try again.' : 'Service unavailable. Please try again.')); error.status = response.status; throw error; }
  return data;
}
function input(name, label, type = 'text', autocomplete = '') { return `<label>${label}<input name="${name}" type="${type}" autocomplete="${autocomplete}" maxlength="${type === 'email' ? 255 : type === 'password' ? 16 : 254}" required></label>`; }
async function show() {
  clearTimeout(captchaTimer);
  if (captchaWidget !== undefined && window.turnstile) { window.turnstile.remove(captchaWidget); captchaWidget = undefined; }
  message.textContent = '';
  const route = location.hash.split('?')[0];
  if (route === '#register') {
    if (!configuration.registrationEnabled) { content.textContent = 'Account creation has not been enabled by the server owner yet.'; return; }
    content.innerHTML = `<h2>Create your account</h2><form data-route="register">${input('username', 'Account name', 'text', 'username')}${input('email', 'Email', 'email', 'email')}${input('password', 'Password (6–16 printable characters)', 'password', 'new-password')}${input('confirmPassword', 'Confirm password', 'password', 'new-password')}<label><input name="acceptTestWarning" type="checkbox" required> I understand this is a public test realm.</label><div id="captcha"></div><button>Create account</button></form>`;
    if (configuration.turnstileEnabled) {
      const mount = () => { if (!document.getElementById('captcha')) return; if (!window.turnstile) { captchaTimer = setTimeout(mount, 200); return; } captchaWidget = window.turnstile.render('#captcha', { sitekey: configuration.turnstileSiteKey, action: configuration.turnstileAction }); };
      mount();
    }
  } else if (route === '#forgot' || route === '#reset') {
    if (!configuration.passwordResetEnabled) { content.textContent = 'Password recovery has not been enabled yet. Contact the team through Discord.'; return; }
    content.innerHTML = route === '#forgot' ? `<h2>Reset password</h2><form data-route="forgot">${input('email', 'Account email', 'email', 'email')}<button>Send reset link</button></form>` : `<h2>Choose a new password</h2><form data-route="reset">${input('password', 'New password', 'password', 'new-password')}${input('confirmPassword', 'Confirm password', 'password', 'new-password')}<button>Change password</button></form>`;
  } else if (account) {
    content.innerHTML = `<h2>Welcome, ${escapeText(account.username)}</h2><p id="characters">Loading characters…</p><button id="logout">Sign out</button>`;
    document.getElementById('logout').onclick = async () => { try { await request('/api/auth/logout', {}); account = null; await show(); } catch (error) { message.textContent = error.message; } };
    try {
      const characters = await request('/api/account/characters');
      const target = document.getElementById('characters');
      if (target) target.innerHTML = characters.length ? `<ul>${characters.map(character => `<li>${escapeText(character.name)} — level ${Number(character.level)}${character.online ? ' · Online' : ''}</li>`).join('')}</ul>` : 'No characters yet. Create your first character in the game.';
    } catch (error) { if (error.status === 401) { account = null; await show(); } message.textContent = error.message; }
  } else content.innerHTML = `<h2>Sign in</h2><form data-route="login">${input('login', 'Account name or email', 'text', 'username')}${input('password', 'Password', 'password', 'current-password')}<button>Sign in</button></form>`;
}
document.addEventListener('submit', async event => {
  const form = event.target; if (!form.dataset.route) return; event.preventDefault();
  const button = form.querySelector('button'); button.disabled = true; message.textContent = '';
  const payload = Object.fromEntries(new FormData(form)); const route = form.dataset.route;
  try {
    if (route === 'register') { payload.acceptTestWarning = form.elements.acceptTestWarning.checked; payload.turnstileToken = payload['cf-turnstile-response'] || ''; }
    if (route === 'reset') payload.token = new URLSearchParams(location.hash.split('?')[1] || '').get('token');
    const result = await request(route === 'login' ? '/api/auth/login' : route === 'register' ? '/api/register' : `/api/password/${route}`, payload);
    if (route === 'login') { account = result; await show(); }
    else { form.reset(); message.textContent = result.message; }
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; if (captchaWidget !== undefined && window.turnstile) window.turnstile.reset(captchaWidget); for (const field of form.querySelectorAll('input[type=password]')) field.value = ''; }
});
window.addEventListener('hashchange', () => show().catch(error => { message.textContent = error.message; }));
(async () => { configuration = await request('/api/site-config'); try { account = await request('/api/auth/session'); } catch (error) { if (error.status !== 401) throw error; } await show(); })().catch(error => { message.textContent = error.message; });
