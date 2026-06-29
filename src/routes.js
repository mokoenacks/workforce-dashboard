const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('./db');


// ---------- Filter options (distinct values) ----------

// Distinct hostnames (for activity logs filter)
router.get('/hostnames', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(
      ` SELECT   DISTINCT Hostname 
        FROM    Devices ORDER BY Hostname`
    );
    res.json(result.recordset.map(r => r.Hostname));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Distinct applications (for activity logs filter)
router.get('/applications', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(
      'SELECT DISTINCT ActiveApplication FROM Activity_Logs ORDER BY ActiveApplication'
    );
    res.json(result.recordset.map(r => r.ActiveApplication));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Distinct device IDs (for sessions filter)
router.get('/deviceids', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(
      'SELECT DISTINCT DeviceId FROM Devices ORDER BY DeviceId'
    );
    res.json(result.recordset.map(r => r.DeviceId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ---------- Active hosts (last 15 min) ----------
router.get('/activehosts', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT DISTINCT B.Hostname 
      FROM  Activity_Logs A
      JOIN  Devices B on A.DeviceId = B.DeviceId
      WHERE 1=1
    `);
    const hosts = result.recordset.map(r => r.Hostname);
    res.json(hosts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Activity logs (with optional date filter) ----------
router.get('/logs', async (req, res) => {
  try {
    const { from, to, hostname, app } = req.query;
    const pool = await poolPromise;
    let query = `
        SELECT B.Hostname, A.ActiveApplication, A.IdleDurationSeconds, A.WindowTitle, A.Timestamp
        FROM Activity_Logs A
        JOIN Devices B on A.DeviceId = B.DeviceId
        WHERE 1=1
    `;
    const request = pool.request();
    if (from) {
      query += ' AND Timestamp >= @from';
      request.input('from', sql.DateTime2, new Date(from));
    }
    if (to) {
      query += ' AND Timestamp <= @to';
      request.input('to', sql.DateTime2, new Date(to + 'T23:59:59'));
    }
    if (hostname) {
      query += ' AND Hostname = @hostname';
      request.input('hostname', sql.NVarChar, hostname);
    }
    if (app) {
      query += ' AND ActiveApplication = @app';
      request.input('app', sql.NVarChar, app);
    }
    query += ' ORDER BY Timestamp DESC';
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- User sessions (last 24h) ----------
router.get('/sessions', async (req, res) => {
  try {
    const { deviceid } = req.query;
    const pool = await poolPromise;
    let query = `
      SELECT A.SessionId, A.DeviceId, B.HostName, A.SignInTime, A.SignOutTime
      FROM Application_Sessions A
      JOIN Devices B ON A.DeviceId = B.DeviceId
      WHERE 1=1
    `;
    const request = pool.request();
    if (deviceid) {
      query += ' AND A.DeviceId = @deviceid';          // ← use alias
      request.input('deviceid', sql.UniqueIdentifier, deviceid);
    }
    query += ' ORDER BY A.SignInTime DESC';
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;