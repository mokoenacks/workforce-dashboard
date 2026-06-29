const { startAuthentication } = SimpleWebAuthnBrowser;

document.getElementById('fingerprintBtn').addEventListener('click', async () => {
  const errorEl = document.getElementById('errorMsg');
  try {
    // 1. Get authentication options
    const optionsResp = await fetch('/api/webauthn/login/options');
    if (!optionsResp.ok) {
      const err = await optionsResp.json();
      errorEl.textContent = err.error || 'No passkey registered';
      return;
    }
    const options = await optionsResp.json();

    // 2. Ask browser to authenticate
    const assertionResponse = await startAuthentication(options);

    // 3. Send to server for verification
    const verifyResp = await fetch('/api/webauthn/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assertionResponse)
    });
    const result = await verifyResp.json();
    if (result.success) {
      window.location.href = '/dashboard';
    } else {
      errorEl.textContent = result.error || 'Login failed';
    }
  } catch (err) {
    errorEl.textContent = 'Fingerprint login failed: ' + err.message;
  }
});