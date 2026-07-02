const cron = require('node-cron');
const ExcelJS = require('exceljs');
const nodemailer = require('nodemailer');
const { poolPromise } = require('./db');
const { canSendToday, markSent } = require('./reportLock');

const SHEET_PASSWORD = 'workforce-readonly';

/**
 * Generate and email the monthly report.
 * If testMode = true, it uses the last 30 days and bypasses the lock (for testing).
 */
async function generateMonthlyReport(testMode = false) {
  // Daily lock – skip if already sent today (only when NOT in test mode)
  if (!canSendToday()) {
    console.log('Report already sent today – skipping.');
    return;
  }

  try {
    console.log('--------------------------------------------------');
    console.log('Generating report... (testMode = ' + testMode + ')');

    // --- Date range calculation ---
    const now = new Date();
    let firstDay, lastDay;

    // Last 30 days for testing
    lastDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    firstDay = new Date(lastDay);
    firstDay.setDate(firstDay.getDate() - 30);
    firstDay.setHours(0, 0, 0, 0);
  
    const from = firstDay.toISOString().slice(0, 10);
    const to = lastDay.toISOString().slice(0, 10);
    console.log(`Date range: ${from} to ${to}`);

    const pool = await poolPromise;

    // 1. Activity logs 
    const logsResult = await pool.request()
      .input('from', from)
      .input('to', to)
      .query(`
        SELECT B.Hostname, A.ActiveApplication, A.WindowTitle, A.IdleDurationSeconds, A.Timestamp
        FROM Activity_Logs A
        JOIN Devices B ON A.DeviceId = B.DeviceId
        WHERE A.Timestamp >= @from AND A.Timestamp < DATEADD(DAY, 1, @to)
        ORDER BY B.Hostname, A.Timestamp
      `);
    const logs = logsResult.recordset;
    console.log(`Activity rows fetched: ${logs.length}`);

    // 2. Sessions – YOUR EXACT SQL (unchanged)
    const sessionsResult = await pool.request()
      .input('from', from)
      .input('to', to)
      .query(`
        SELECT A.SessionId, A.DeviceId, A.SignInTime, A.SignOutTime,
               COALESCE(B.Hostname, 'Unknown') AS Hostname
        FROM Application_Sessions A
        LEFT JOIN (
                    SELECT DISTINCT A.DeviceId, B.Hostname 
                    FROM Activity_Logs A 
                    JOIN Devices B ON A.DeviceId = B.DeviceId
                  ) B ON A.DeviceId = B.DeviceId
        WHERE A.SignInTime >= @from AND A.SignInTime < DATEADD(DAY, 1, @to)
        ORDER BY A.SignInTime
      `);
    const sessions = sessionsResult.recordset;
    console.log(`Session rows fetched: ${sessions.length}`);

    // 3. Group logs by Hostname
    const logsByHost = {};
    logs.forEach(log => {
      const host = log.Hostname || 'Unknown';
      if (!logsByHost[host]) logsByHost[host] = [];
      logsByHost[host].push(log);
    });
    const hostnames = Object.keys(logsByHost).sort();
    console.log(`Unique hostnames: ${hostnames.length} (${hostnames.join(', ')})`);

    // 4. Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Workforce Monitor';
    workbook.created = new Date();

    const protectSheet = (sheet) => {
      sheet.protect(SHEET_PASSWORD, {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertColumns: false,
        insertRows: false,
        insertHyperlinks: false,
        deleteColumns: false,
        deleteRows: false,
        sort: false,
        autoFilter: false,
        pivotTables: false,
        objects: false,
        scenarios: false
      });
    };

    // 5. Add one sheet per hostname
    hostnames.forEach(hostname => {
      const rows = logsByHost[hostname];
      console.log(`Creating sheet '${hostname}' with ${rows.length} rows`);
      const sheet = workbook.addWorksheet(hostname);
      sheet.columns = [
        { header: 'ActiveApplication', key: 'app', width: 30 },
        { header: 'ActiveTime (formatted)', key: 'activeTime', width: 15 },
         { header: 'WindowTitle', key: 'windowTitle', width: 30 },
        { header: 'IdleDurationSeconds', key: 'idle', width: 20 },
        { header: 'Timestamp', key: 'timestamp', width: 25 }
      ];
      rows.forEach(log => {
        sheet.addRow({
          app: log.ActiveApplication,
          activeTime: secondsToHms(5),
          windowTitle: log.WindowTitle,
          idle: log.IdleDurationSeconds,
          timestamp: new Date(log.Timestamp).toISOString()
        });
      });
      protectSheet(sheet);
    });

    // 6. Sessions sheet
    const sessionSheet = workbook.addWorksheet('Sessions');
    sessionSheet.columns = [
      { header: 'Hostname', key: 'hostname', width: 20 },
      { header: 'DeviceId', key: 'deviceId', width: 40 },
      { header: 'SignInTime', key: 'signIn', width: 25 },
      { header: 'SignOutTime', key: 'signOut', width: 25 }
    ];
    sessions.forEach(s => {
      sessionSheet.addRow({
        hostname: s.Hostname,
        deviceId: s.DeviceId,
        signIn: s.SignInTime ? new Date(s.SignInTime).toISOString() : '',
        signOut: s.SignOutTime ? new Date(s.SignOutTime).toISOString() : 'Active'
      });
    });
    protectSheet(sessionSheet);

    // 7. Write workbook to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    console.log(`Workbook buffer size: ${buffer.length} bytes`);

    // 8. Send email
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT, 10),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const monthName = firstDay.toLocaleString('default', { month: 'long' });
    const year = firstDay.getFullYear();
    const subject = testMode
      ? `Workforce Activity – Last 30 Days`
      : `Workforce Monitor Monthly Report – ${monthName} ${year}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_TO,
      subject,
      text: `Dear Admin,\n\nPlease find attached the report.\n\n– Workforce Monitor`,
      attachments: [{
        filename: testMode ? 'Test_Report.xlsx' : `Workforce_Report_${year}_${String(firstDay.getMonth()+1).padStart(2,'0')}.xlsx`,
        content: Buffer.from(buffer)
      }]
    };

    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully.');

    // Mark today as sent (only for non-test reports)
    if (!testMode) {
      markSent();
      console.log('Daily lock updated.');
    }
  } catch (err) {
    console.error('Report generation failed:', err);
  }
}

// Helper
function secondsToHms(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// Start cron job (monthly schedule)
function startScheduler() {
  const cronExpression = process.env.REPORT_CRON || '0 0 1 * *';
  cron.schedule(cronExpression, () => generateMonthlyReport(false), {
    scheduled: true,
    timezone: process.env.TZ || 'Africa/Johannesburg'
  });
  console.log('Monthly report scheduler started.');
}

// Export both functions so server.js can use them
module.exports = { startScheduler, generateMonthlyReport };