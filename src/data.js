const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('./db');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.use((req, res, next) => {
  if (!req.session.loggedIn) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

router.get('/activehosts', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT DISTINCT B.Hostname 
      FROM  Activity_Logs A
      JOIN  Devices B on A.DeviceId = B.DeviceId
      WHERE 1=1
    `);
    const hosts = result.recordset.map((r) => r.Hostname);
    res.json(hosts);
  } catch (err) {
    console.error('Error fetching active hosts:', err.message);
    res.status(503).json({ error: 'Unable to fetch active hosts right now' });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const { from, to } = req.query;

    if (from && !DATE_RE.test(from)) {
      return res.status(400).json({ error: 'Invalid "from" date format, expected YYYY-MM-DD' });
    }
    if (to && !DATE_RE.test(to)) {
      return res.status(400).json({ error: 'Invalid "to" date format, expected YYYY-MM-DD' });
    }

    const pool = await poolPromise;
    let query = `
      SELECT B.Hostname, A.ActiveApplication, A.IdleDurationSeconds, A.Timestamp
      FROM  Activity_Logs A
      JOIN Devices B on A.DeviceId = B.DeviceId
      WHERE 1=1
    `;
    const request = pool.request();

    if (from) {
      const fromDate = new Date(`${from}T00:00:00Z`);
      if (Number.isNaN(fromDate.getTime())) {
        return res.status(400).json({ error: 'Invalid "from" date' });
      }
      query += ' AND Timestamp >= @from';
      request.input('from', sql.DateTime2, fromDate);
    }
    if (to) {
      const toDate = new Date(`${to}T23:59:59Z`);
      if (Number.isNaN(toDate.getTime())) {
        return res.status(400).json({ error: 'Invalid "to" date' });
      }
      query += ' AND Timestamp <= @to';
      request.input('to', sql.DateTime2, toDate);
    }
    query += ' ORDER BY Timestamp DESC';

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching logs:', err.message);
    res.status(503).json({ error: 'Unable to fetch logs right now' });
  }
});

module.exports = router;
