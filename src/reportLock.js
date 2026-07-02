const fs = require('fs');
const path = require('path');

const lockFile = path.join(__dirname, '..', 'last_report_sent.txt');
const cronExpression = process.env.REPORT_CRON || '0 0 1 * *';   // default: monthly

/**
 * Derive a unique period key from the current date, based on the cron schedule.
 * - If the cron runs monthly (0 0 1 * *), we use "YYYY-MM" to block duplicates within the same month.
 * - If daily (* * *), we use "YYYY-MM-DD".
 * - If weekly, we use "YYYY-Www".
 * - For any other, fall back to "YYYY-MM-DD" (daily).
 */
function getPeriodKey() {
  const now = new Date();

  // Monthly detection: minute=0, hour=0, dayOfMonth=1 (any month, any weekday)
  if (cronExpression === '0 0 1 * *') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  // Daily detection: any cron that runs once per day at midnight (0 0 * * *)
  if (cronExpression === '0 0 * * *') {
    return now.toISOString().slice(0, 10);   // YYYY-MM-DD
  }

  // Weekly detection: if it contains a specific weekday (e.g., 0 0 * * 1) - simple check
  const parts = cronExpression.split(' ');
  if (parts.length === 5 && parts[4] !== '*' && parts[4] !== '?') {
    // Weekly cron: compute ISO week number (year-week)
    const year = now.getFullYear();
    const jan1 = new Date(year, 0, 1);
    const days = Math.floor((now - jan1) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + jan1.getDay() + 1) / 7);
    return `${year}-W${String(weekNumber).padStart(2, '0')}`;
  }

  // Fallback: daily lock
  return now.toISOString().slice(0, 10);
}

function canSendToday() {
  if (!fs.existsSync(lockFile)) return true;
  const lastPeriod = fs.readFileSync(lockFile, 'utf-8').trim();
  const currentPeriod = getPeriodKey();
  return lastPeriod !== currentPeriod;
}

function markSent() {
  const currentPeriod = getPeriodKey();
  fs.writeFileSync(lockFile, currentPeriod);
}

module.exports = { canSendToday, markSent };