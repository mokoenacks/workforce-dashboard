const fs = require('fs');
const path = require('path');

const lockFile = path.join(__dirname, '..', 'last_report_sent.txt');

// Check if a report was already sent today (or this month)
function canSendToday() {
  if (!fs.existsSync(lockFile)) return true;
  const lastSent = fs.readFileSync(lockFile, 'utf-8').trim();
  const today = new Date().toISOString().slice(0, 10);   // YYYY-MM-DD
  return lastSent !== today;
}

// Record that we sent a report today
function markSent() {
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(lockFile, today);
}

module.exports = { canSendToday, markSent };