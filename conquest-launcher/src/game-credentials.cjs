// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
const fs = require('node:fs/promises');

// Private main-process storage only. Never returned across IPC.
class GameCredentials {
  constructor(file, encrypt, decrypt) { this.file = file; this.encrypt = encrypt; this.decrypt = decrypt; this.queue = Promise.resolve(); this.version = 0; }
  async read(username) {
    await this.queue;
    try {
      const value = JSON.parse(this.decrypt(await fs.readFile(this.file)));
      if (value.username === username && typeof value.password === 'string' && value.password) return value;
    } catch {}
    return null;
  }
  write(value) {
    this.version++;
    const pending = this.queue.then(async () => {
      if (!value) { await fs.unlink(this.file).catch(error => { if (error.code !== 'ENOENT') throw error; }); return; }
      try {
        await fs.writeFile(this.file + '.tmp', this.encrypt(JSON.stringify(value)), { mode: 0o600 });
        await fs.rename(this.file + '.tmp', this.file);
      } catch (error) {
        await fs.unlink(this.file + '.tmp').catch(() => {});
        await fs.unlink(this.file).catch(() => {});
        throw new Error('Game credentials could not be saved securely. Sign in again to use automatic game login.', { cause: error });
      }
    });
    this.queue = pending.catch(() => {});
    return pending;
  }
}
module.exports = { GameCredentials };
