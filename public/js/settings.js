const { startRegistration } = SimpleWebAuthnBrowser;

document.getElementById('registerBtn').addEventListener('click', async () => {
  try {
    const optionsResp = await fetch('/api/webauthn/register/options');
    if (!optionsResp.ok) {
      document.getElementById('status').textContent = 'You must be logged in first.';
      return;
    }
    const options = await optionsResp.json();
    const attResp = await startRegistration(options);
    const verifyResp = await fetch('/api/webauthn/register/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attResp)
    });
    const result = await verifyResp.json();
    if (result.success) {
      document.getElementById('status').textContent = 'Passkey registered! You can now login with it.';
    } else {
      document.getElementById('status').textContent = result.error;
    }
  } catch (err) {
    document.getElementById('status').textContent = 'Error: ' + err.message;
  }
});