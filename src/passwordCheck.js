const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', 'data');
const passwordFile = path.join(dataDir, 'password.json');
const SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const REVERT_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  }
}

function readStore() {
  ensureDataDir();
  if (!fs.existsSync(passwordFile)) {
    const initial = process.env.DASHBOARD_PASSWORD;
    if (!initial || initial.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `DASHBOARD_PASSWORD must be set in the environment and be at least ${MIN_PASSWORD_LENGTH} characters long on first run`
      );
    }
    const store = {
      passwordHash: bcrypt.hashSync(initial, SALT_ROUNDS),
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(passwordFile, JSON.stringify(store, null, 2), { mode: 0o600 });
    return store;
  }
  return JSON.parse(fs.readFileSync(passwordFile, 'utf-8'));
}

function writeStore(store) {
  ensureDataDir();
  fs.writeFileSync(passwordFile, JSON.stringify(store, null, 2), { mode: 0o600 });
}

// In-memory, single-use, short-lived tokens that let an admin undo an
// unauthorized password change. token -> { previousHash, expiresAt }
const revertTokens = new Map();

function pruneExpiredTokens() {
  const now = Date.now();
  for (const [token, entry] of revertTokens.entries()) {
    if (entry.expiresAt < now) revertTokens.delete(token);
  }
}

module.exports = {
  checkPassword(input) {
    if (typeof input !== 'string' || input.length === 0) return false;
    const store = readStore();
    return bcrypt.compareSync(input, store.passwordHash);
  },

  /**
   * Returns a one-time revert token on success, or null if oldPassword
   * was incorrect. Throws if newPassword fails validation.
   */
  changePassword(oldPassword, newPassword) {
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`New password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
    }
    if (newPassword === oldPassword) {
      throw new Error('New password must be different from the old password');
    }
    if (!this.checkPassword(oldPassword)) {
      return null;
    }

    const store = readStore();
    const previousHash = store.passwordHash;
    writeStore({
      passwordHash: bcrypt.hashSync(newPassword, SALT_ROUNDS),
      updatedAt: new Date().toISOString()
    });

    pruneExpiredTokens();
    const token = crypto.randomBytes(32).toString('hex');
    revertTokens.set(token, { previousHash, expiresAt: Date.now() + REVERT_TOKEN_TTL_MS });
    return token;
  },

  /** Reverts to the password that was active before a given change. Single use. */
  revertPassword(token) {
    pruneExpiredTokens();
    const entry = revertTokens.get(token);
    if (!entry) return false;
    revertTokens.delete(token);
    writeStore({ passwordHash: entry.previousHash, updatedAt: new Date().toISOString() });
    return true;
  }
};
