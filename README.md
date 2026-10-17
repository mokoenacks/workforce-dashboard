# Workforce dashboard

Website for monitoring data stored in SQL Server. People sign in with an allowed Google account before they can open the dashboard.

## Stack

- Node.js and Express
- Azure SQL through `mssql`
- Google sign-in and WebAuthn
- Scheduled jobs and Excel reports

## Run it

1. Install Node.js.
2. Create a `.env` file with:

```
PORT=3000
SESSION_SECRET=replace-me
GOOGLE_CLIENT_ID=replace-me
GOOGLE_CLIENT_SECRET=replace-me
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
ALLOWED_GOOGLE_ACCOUNTS=you@example.com
DB_CONNECTION_STRING=replace-me
```

3. Start the server:

```
npm install
npm start
```

The dashboard is at http://localhost:3000.
