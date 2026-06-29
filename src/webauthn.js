const express = require('express');
const router = express.Router();
const { generateRegistrationOptions, verifyRegistrationResponse,
        generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
const { poolPromise } = require('./db');

const rpID = process.env.RP_ID || 'localhost';
const rpName = 'Workforce Dashboard';

// Helper: convert string to Uint8Array
function toBuffer(str) { return new TextEncoder().encode(str); }

// Helper: get admin's credentials from DB
async function getCredentials() {
  const pool = await poolPromise;
  const result = await pool.request()
    .input('userId', 'admin')
    .query('SELECT Id, CredentialId, PublicKey, SignCount FROM dbo.PasskeyCredentials WHERE UserId = @userId');
  return result.recordset;
}

// --- Registration (protected) ---
router.get('/register/options', ensureAuthenticated, async (req, res) => {
  const existing = await getCredentials();
  const excludeCredentials = existing.map(c => ({ id: Buffer.from(c.CredentialId) }));

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: toBuffer('admin'),          // Uint8Array
    userName: 'admin',
    attestationType: 'none',
    excludeCredentials,
  });
  req.session.webauthnChallenge = options.challenge;
  res.json(options);
});

router.post('/register/verify', ensureAuthenticated, async (req, res) => {
  try {
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: req.session.webauthnChallenge,
      expectedOrigin: `http://${rpID}`,
      expectedRPID: rpID,
    });
    if (verification.verified) {
      const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
      const pool = await poolPromise;
      await pool.request()
        .input('userId', 'admin')
        .input('credentialId', Buffer.from(credentialID))
        .input('publicKey', Buffer.from(credentialPublicKey))
        .input('signCount', counter)
        .query(`INSERT INTO dbo.PasskeyCredentials (UserId, CredentialId, PublicKey, SignCount)
                VALUES (@userId, @credentialId, @publicKey, @signCount)`);
      delete req.session.webauthnChallenge;
      return res.json({ success: true });
    }
    res.status(400).json({ error: 'Registration failed' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Authentication (fingerprint login) ---
router.get('/login/options', async (req, res) => {
  const credentials = await getCredentials();
  if (credentials.length === 0) return res.status(400).json({ error: 'No passkey registered' });
  const allowCredentials = credentials.map(c => ({
    id: Buffer.from(c.CredentialId),
    type: 'public-key'
  }));
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
  });
  req.session.webauthnChallenge = options.challenge;
  res.json(options);
});

router.post('/login/verify', async (req, res) => {
  try {
    const credentials = await getCredentials();
    const found = credentials.find(c => Buffer.compare(Buffer.from(c.CredentialId), Buffer.from(req.body.id)) === 0);
    if (!found) return res.status(400).json({ error: 'Unknown credential' });

    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: req.session.webauthnChallenge,
      expectedOrigin: `http://${rpID}`,
      expectedRPID: rpID,
      credential: {
        credentialID: Buffer.from(found.CredentialId),
        publicKey: Buffer.from(found.PublicKey),
        counter: found.SignCount,
      },
    });
    if (verification.verified) {
      // Update sign count
      await poolPromise.then(pool => pool.request()
        .input('id', found.Id)
        .input('counter', verification.authenticationInfo.newCounter)
        .query('UPDATE dbo.PasskeyCredentials SET SignCount = @counter WHERE Id = @id')
      );
      // Log in the user by creating a session directly
      req.login({ id: 'admin', name: 'Admin' }, (err) => {
        if (err) return res.status(500).json({ error: 'Login failed' });
        delete req.session.webauthnChallenge;
        res.json({ success: true });
      });
    } else {
      res.status(401).json({ error: 'Authentication failed' });
    }
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Middleware to protect registration
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Login required' });
}

module.exports = router;