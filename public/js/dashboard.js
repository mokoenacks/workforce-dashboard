const API = window.location.origin + '/api';

// Store the last fetched logs for Excel export (raw rows)
let currentLogs = [];

// ========================
// Populate dropdowns
// ========================
async function loadFilterOptions() {
  // Hostnames for activity
  try {
    const res = await fetch(`${API}/hostnames`);
    const hostnames = await res.json();
    const select = document.getElementById('hostnameFilter');
    hostnames.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h; opt.textContent = h;
      select.appendChild(opt);
    });
  } catch (err) { console.error(err); }

  // Applications
  try {
    const res = await fetch(`${API}/applications`);
    const apps = await res.json();
    const select = document.getElementById('appFilter');
    apps.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a; opt.textContent = a;
      select.appendChild(opt);
    });
  } catch (err) { console.error(err); }

  // Device IDs for sessions
  try {
    const res = await fetch(`${API}/deviceids`);
    const deviceIds = await res.json();
    const select = document.getElementById('deviceIdFilter');
    deviceIds.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d;
      select.appendChild(opt);
    });
  } catch (err) { console.error(err); }
}

// ========================
// Sign out button (POST to /logout to avoid CSRF issues)
// ========================
document.getElementById('signOutBtn').addEventListener('click', async () => {
  await fetch('/logout', { method: 'POST' });
  window.location.href = '/login';
});

// ========================
// Activity Logs (grouped)
// ========================
async function loadLogs() {
  const from = document.getElementById('fromDate').value;
  const to = document.getElementById('toDate').value;
  const hostname = document.getElementById('hostnameFilter').value;
  const app = document.getElementById('appFilter').value;

  let url = `${API}/logs?`;
  if (from) url += `from=${from}&`;
  if (to) url += `to=${to}&`;
  if (hostname) url += `hostname=${encodeURIComponent(hostname)}&`;
  if (app) url += `app=${encodeURIComponent(app)}&`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    currentLogs = await res.json();
    renderGroupedLogs(currentLogs);
  } catch (err) {
    console.error(err);
    document.querySelector('#logTable tbody').innerHTML =
      '<tr><td colspan="5" class="text-danger">Error loading logs</td></tr>';
  }
}

function renderGroupedLogs(logs) {
  // Group by Hostname + ActiveApplication
  const groups = new Map();
  logs.forEach(log => {
    const key = `${log.Hostname}|||${log.ActiveApplication}`;
    if (!groups.has(key)) {
      groups.set(key, {
        hostname: log.Hostname,
        app: log.ActiveApplication,
        entries: [],
        totalIdle: 0,
        count: 0
      });
    }
    const group = groups.get(key);
    group.entries.push(log);
    group.totalIdle += log.IdleDurationSeconds;
    group.count++;
  });

  const tbody = document.querySelector('#logTable tbody');
  tbody.innerHTML = '';

  groups.forEach(group => {
    const totalActive = group.count * 5; // 5 seconds per entry

    // Main row: Hostname | App | totalActive | totalIdle | (empty placeholder)
    const mainRow = document.createElement('tr');
    mainRow.className = 'group-row';
    mainRow.style.cursor = 'pointer';
    mainRow.innerHTML = `
      <td>${group.hostname}</td>
      <td>${group.app}</td>
      <td>${formatTime(totalActive)}</td>
      <td>${formatTime(group.totalIdle)}</td>
      <td>${new Date(Math.max(...group.entries.map(e => new Date(e.Timestamp)))).toLocaleDateString()}</td>
      <td></td>
    `;
    mainRow.addEventListener('click', function () {
      toggleGroupRows(mainRow, group);
    });
    tbody.appendChild(mainRow);

    // Sub-rows (hidden initially)
    group.entries.forEach(entry => {
      const subRow = document.createElement('tr');
      subRow.className = 'sub-row';
      subRow.style.display = 'none';
      subRow.innerHTML = `
        <td style="padding-left: 2rem;">${entry.WindowTitle || 'N/A'}</td>
        <td></td>
        <td>${formatTime(5)}</td>
        <td>${formatTime(entry.IdleDurationSeconds)}</td>
        <td>${new Date(entry.Timestamp).toLocaleDateString()}</td>
        <td></td>
      `;
      tbody.appendChild(subRow);
    });
  });
}

function toggleGroupRows(mainRow, group) {
  const tbody = document.querySelector('#logTable tbody');
  const allSubRows = tbody.querySelectorAll('.sub-row');
  const allGroupRows = tbody.querySelectorAll('.group-row');

  // Close all other expanded groups
  allGroupRows.forEach(row => {
    if (row !== mainRow) {
      row.classList.remove('expanded');
      // Hide all sub-rows of other groups
      const nextRow = row.nextElementSibling;
      if (nextRow && nextRow.classList.contains('sub-row')) {
        // Hide all consecutive sub-rows until next group row or end
        let sibling = nextRow;
        while (sibling && sibling.classList.contains('sub-row')) {
          sibling.style.display = 'none';
          sibling = sibling.nextElementSibling;
        }
      }
    }
  });

  // Toggle current group's sub-rows
  const nextRow = mainRow.nextElementSibling;
  if (nextRow && nextRow.classList.contains('sub-row')) {
    let sibling = nextRow;
    const isCurrentlyHidden = sibling.style.display === 'none';
    while (sibling && sibling.classList.contains('sub-row')) {
      sibling.style.display = isCurrentlyHidden ? 'table-row' : 'none';
      sibling = sibling.nextElementSibling;
    }
    if (isCurrentlyHidden) {
      mainRow.classList.add('expanded');
    } else {
      mainRow.classList.remove('expanded');
    }
  }
}

// ========================
// Sessions (unchanged)
// ========================
async function loadSessions() {
  const deviceId = document.getElementById('deviceIdFilter').value;
  let url = `${API}/sessions?`;
  if (deviceId) url += `deviceid=${encodeURIComponent(deviceId)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    const sessions = await res.json();
    const tbody = document.querySelector('#sessionsTable tbody');
    tbody.innerHTML = '';
    sessions.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.SessionId}</td>
        <td>${s.HostName ?? 'Unknown'}</td>
        <td>${s.SignInTime ? new Date(s.SignInTime).toLocaleString() : ''}</td>
        <td>${s.SignOutTime ? new Date(s.SignOutTime).toLocaleString() : '<span class="text-muted">Active</span>'}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) { console.error(err); }
}

// ========================
// Excel export (exports the raw logs, not grouped view)
// ========================
document.getElementById('exportBtn').addEventListener('click', async () => {
  if (currentLogs.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('ActivityLogs');
  sheet.columns = [
    { header: 'Hostname', key: 'hostname' },
    { header: 'ActiveApplication', key: 'app' },
    { header: 'WindowTitle', key: 'windowTitle' },
    { header: 'ActiveTime', key: 'active' },
    { header: 'IdleTime', key: 'idle' },
    { header: 'Date', key: 'date' }
  ];

  currentLogs.forEach(log => {
    sheet.addRow({
      hostname: log.Hostname,
      app: log.ActiveApplication,
      windowTitle: log.WindowTitle,
      active: formatTime(5),
      idle: formatTime(log.IdleDurationSeconds),
      date: new Date(log.Timestamp).toLocaleDateString()
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'ActivityLogs.xlsx';
  link.click();
});

// ========================
// Dark / Light mode toggle
// ========================
document.addEventListener('DOMContentLoaded', function () {
  const html = document.getElementById('htmlRoot');
  const toggleBtn = document.getElementById('themeToggle');
  if (!html || !toggleBtn) return;

  const savedTheme = localStorage.getItem('theme') || 'dark';
  html.setAttribute('data-bs-theme', savedTheme);
  updateButtonText(savedTheme);

  toggleBtn.addEventListener('click', () => {
    const current = html.getAttribute('data-bs-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-bs-theme', next);
    localStorage.setItem('theme', next);
    updateButtonText(next);
  });

  function updateButtonText(theme) {
    toggleBtn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
  }
});

// ========================
// Helper
// ========================
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// ========================
// Initialize
// ========================
document.getElementById('filterBtn').addEventListener('click', loadLogs);
document.getElementById('sessionFilterBtn').addEventListener('click', loadSessions);

loadFilterOptions().then(() => {
  loadLogs();
  loadSessions();
});