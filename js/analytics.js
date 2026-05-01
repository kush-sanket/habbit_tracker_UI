/**
 * analytics.js — Goal Fulfillment Stats page logic
 */

// ─── Auth guard ──────────────────────────────────────────────────────────────
if (!Auth.isLoggedIn()) {
  window.location.href = 'index.html';
}

// ─── Navbar setup ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const user = Auth.getUser();
  if (user) {
    const lbl = document.getElementById('usernameLabel');
    if (lbl) lbl.textContent = user.username || user.email || '';
  }

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    try { await API.logout(); } catch (_) {}
    Auth.clear();
    window.location.href = 'index.html';
  });

  document.getElementById('refreshBtn')?.addEventListener('click', loadAnalytics);
  document.getElementById('retryBtn')?.addEventListener('click', loadAnalytics);

  await loadAnalytics();
});

// ─── Main loader ─────────────────────────────────────────────────────────────
async function loadAnalytics() {
  show('loadingState');
  hide('analyticsContent');
  hide('errorState');

  try {
    const data = await API.getDashboardAnalytics();
    renderAll(data);
    show('analyticsContent');
  } catch (err) {
    console.error('Analytics load error:', err);
    show('errorState');
  } finally {
    hide('loadingState');
  }
}

// ─── Render ──────────────────────────────────────────────────────────────────
function renderAll(data) {
  renderNavStreak(data.streak);
  renderStatCards(data.overview, data.streak);
  renderToday(data.today);
  renderLimits(data.limits);
  renderCalendar(data.calendar);
  renderLoginCalendar(data.login_calendar, data.login_streak);
  renderBranchHealth(data.branches);
  renderOverview(data.overview);

  const sub = document.getElementById('subheading');
  if (sub) sub.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
}

function renderNavStreak(streak) {
  const badge = document.getElementById('streakBadge');
  if (badge) badge.textContent = `🔥 ${streak.current}`;
}

function renderStatCards(overview, streak) {
  setText('totalBranches', overview.total_branches);
  setText('completionRate', `${overview.completion_rate}%`);
  setText('currentStreak', `${streak.current} day${streak.current !== 1 ? 's' : ''}`);
  setText('highestStreak', `${streak.highest} day${streak.highest !== 1 ? 's' : ''}`);
}

function renderToday(today) {
  const d = new Date(today.date + 'T00:00:00');
  const dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  setText('todayDate', dateStr);
  setText('todayCompleted', today.completed);
  setText('todayPending', today.pending);
  setText('todayTotal', today.total);

  const pct = today.total > 0 ? Math.round(today.completed / today.total * 100) : 0;
  const circumference = 2 * Math.PI * 32; // r=32
  const fill = document.getElementById('todayDonutFill');
  const pctLabel = document.getElementById('todayDonutPct');
  if (fill) {
    fill.style.strokeDasharray = `${(pct / 100) * circumference} ${circumference}`;
  }
  if (pctLabel) pctLabel.textContent = `${pct}%`;
}

function renderLimits(limits) {
  setText('branchLimitText', `${limits.branches_created_today} / 2`);
  setText('taskLimitText', `${limits.tasks_created_today} / 10`);

  const branchPct = Math.min(100, (limits.branches_created_today / 2) * 100);
  const taskPct   = Math.min(100, (limits.tasks_created_today / 10) * 100);

  const bBar = document.getElementById('branchLimitBar');
  const tBar = document.getElementById('taskLimitBar');
  if (bBar) {
    bBar.style.width = `${branchPct}%`;
    bBar.style.background = branchPct >= 100 ? '#e57373' : 'var(--accent-green)';
  }
  if (tBar) {
    tBar.style.width = `${taskPct}%`;
    tBar.style.background = taskPct >= 100 ? '#e57373' : '#42a5f5';
  }
}

function renderCalendar(calendar) {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  grid.innerHTML = '';

  calendar.forEach(day => {
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    const color = calCellColor(day);
    cell.style.background = color;

    const tip = document.createElement('div');
    tip.className = 'cal-tooltip';
    const label = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    tip.textContent = day.total
      ? `${label}: ${day.completed}/${day.total} done`
      : `${label}: no tasks`;
    cell.appendChild(tip);
    grid.appendChild(cell);
  });
}

function calCellColor(day) {
  if (day.total === 0) return 'var(--progress-bg)';
  const rate = day.rate;
  if (rate >= 80) return '#2d8a4e';
  if (rate >= 50) return '#66bb6a';
  if (rate >= 20) return '#ffa726';
  return '#e57373';
}

// ─── Login calendar (full month view) ────────────────────────────────────────
let _loginCalendarData = [];   // full data set from API — all known dates
let _lcYear = new Date().getFullYear();
let _lcMonth = new Date().getMonth(); // 0-indexed

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

function renderLoginCalendar(calendar, loginStreak) {
  if (!calendar) return;
  _loginCalendarData = calendar;   // cache for re-renders when user changes month

  // Update streak pills
  setText('loginStreakCurrent', loginStreak?.current ?? 0);
  setText('loginStreakBest',    loginStreak?.highest ?? 0);

  // Populate year / month dropdowns once
  _initLcDropdowns(calendar);

  // Wire nav buttons (idempotent — check for existing listener via dataset flag)
  const prevBtn = document.getElementById('lcPrevMonth');
  const nextBtn = document.getElementById('lcNextMonth');
  const monthSel = document.getElementById('lcMonthSelect');
  const yearSel  = document.getElementById('lcYearSelect');

  if (prevBtn && !prevBtn.dataset.bound) {
    prevBtn.dataset.bound = '1';
    prevBtn.addEventListener('click', () => {
      _lcMonth--;
      if (_lcMonth < 0) { _lcMonth = 11; _lcYear--; }
      _syncLcDropdowns();
      _drawLoginMonth();
    });
  }
  if (nextBtn && !nextBtn.dataset.bound) {
    nextBtn.dataset.bound = '1';
    nextBtn.addEventListener('click', () => {
      _lcMonth++;
      if (_lcMonth > 11) { _lcMonth = 0; _lcYear++; }
      _syncLcDropdowns();
      _drawLoginMonth();
    });
  }
  if (monthSel && !monthSel.dataset.bound) {
    monthSel.dataset.bound = '1';
    monthSel.addEventListener('change', () => {
      _lcMonth = parseInt(monthSel.value);
      _drawLoginMonth();
    });
  }
  if (yearSel && !yearSel.dataset.bound) {
    yearSel.dataset.bound = '1';
    yearSel.addEventListener('change', () => {
      _lcYear = parseInt(yearSel.value);
      _drawLoginMonth();
    });
  }

  _drawLoginMonth();
}

function _initLcDropdowns(calendar) {
  const monthSel = document.getElementById('lcMonthSelect');
  const yearSel  = document.getElementById('lcYearSelect');
  if (!monthSel || !yearSel) return;

  // Months
  if (!monthSel.dataset.inited) {
    monthSel.dataset.inited = '1';
    MONTH_NAMES.forEach((name, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = name;
      monthSel.appendChild(opt);
    });
  }

  // Years: from earliest date in calendar to current year
  if (!yearSel.dataset.inited) {
    yearSel.dataset.inited = '1';
    const years = new Set();
    const today = new Date();
    calendar.forEach(e => years.add(new Date(e.date + 'T00:00:00').getFullYear()));
    years.add(today.getFullYear());
    [...years].sort().forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      yearSel.appendChild(opt);
    });
  }
  _syncLcDropdowns();
}

function _syncLcDropdowns() {
  const monthSel = document.getElementById('lcMonthSelect');
  const yearSel  = document.getElementById('lcYearSelect');
  if (monthSel) monthSel.value = _lcMonth;
  if (yearSel)  yearSel.value  = _lcYear;
}

function _drawLoginMonth() {
  const grid = document.getElementById('loginCalendarGrid');
  if (!grid) return;
  grid.innerHTML = '';

  // Build a lookup: 'YYYY-MM-DD' -> status
  const statusMap = {};
  _loginCalendarData.forEach(e => { statusMap[e.date] = e.status; });

  const today = new Date();
  today.setHours(0,0,0,0);

  // First day of the displayed month
  const firstDay = new Date(_lcYear, _lcMonth, 1);
  const startDow = firstDay.getDay(); // 0=Sun

  // Total days in month
  const daysInMonth = new Date(_lcYear, _lcMonth + 1, 0).getDate();

  // Leading empty spacers
  for (let i = 0; i < startDow; i++) {
    const spacer = document.createElement('div');
    spacer.className = 'login-cal-cell lc-empty';
    grid.appendChild(spacer);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(_lcYear, _lcMonth, d);
    cellDate.setHours(0,0,0,0);
    const ds = _toDateStr(cellDate);

    const status = statusMap[ds];   // may be undefined for dates outside the 30-day window

    let cls = 'login-cal-cell ';
    let tipText = '';
    const label = cellDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    if (cellDate > today) {
      cls += 'lc-future';
      tipText = `${label} — upcoming`;
    } else if (status === 'logged_in') {
      cls += 'lc-logged-in';
      tipText = `${label} — ✅ Logged in`;
    } else if (status === 'missed') {
      cls += 'lc-missed';
      tipText = `${label} — ❌ Not logged in`;
    } else if (status === 'before_signup') {
      cls += 'lc-before';
      tipText = `${label} — before signup`;
    } else {
      // Date exists but no data (outside 30-day window) — treat as before
      cls += 'lc-before';
      tipText = `${label} — no data`;
    }

    const cell = document.createElement('div');
    cell.className = cls;

    // Date number
    const num = document.createElement('span');
    num.className = 'lc-date-num';
    num.textContent = d;
    cell.appendChild(num);

    // Small dot indicator for logged-in days
    if (status === 'logged_in') {
      const dot = document.createElement('span');
      dot.className = 'lc-status-dot';
      cell.appendChild(dot);
    }

    // Today ring
    if (cellDate.getTime() === today.getTime()) {
      cell.classList.add('lc-today');
    }

    // Tooltip
    const tip = document.createElement('div');
    tip.className = 'lc-tooltip';
    tip.textContent = tipText;
    cell.appendChild(tip);

    grid.appendChild(cell);
  }

  // Trailing spacers to complete the last row
  const totalCells = startDow + daysInMonth;
  const remainder = totalCells % 7;
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) {
      const spacer = document.createElement('div');
      spacer.className = 'login-cal-cell lc-empty';
      grid.appendChild(spacer);
    }
  }
}

function _toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function renderBranchHealth(branches) {
  const list = document.getElementById('branchHealthList');
  const noMsg = document.getElementById('noBranchesMsg');
  if (!list) return;
  list.innerHTML = '';

  if (!branches || branches.length === 0) {
    noMsg?.classList.remove('d-none');
    return;
  }
  noMsg?.classList.add('d-none');

  // Sort by health_score desc
  const sorted = [...branches].sort((a, b) => b.health_score - a.health_score);

  sorted.forEach(b => {
    const item = document.createElement('div');
    item.className = 'branch-health-item';

    const healthColor = b.health_score >= 70 ? '#2d8a4e'
      : b.health_score >= 40 ? '#ffa726'
      : '#e57373';

    item.innerHTML = `
      <div class="bh-icon" style="background:${b.category_color}22;">
        <span>${b.category_icon}</span>
      </div>
      <div class="bh-info">
        <div class="bh-name">${escHtml(b.name)}</div>
        <div class="bh-meta">${escHtml(b.category || 'General')} · ${b.completed_tasks}/${b.total_tasks} tasks</div>
      </div>
      <div class="bh-progress-wrap">
        <div class="bh-progress-label">${b.health_score}%</div>
        <div class="branch-progress">
          <div class="branch-progress-bar" style="width:${b.health_score}%;background:${healthColor};"></div>
        </div>
      </div>
      <div class="bh-streak">
        <div class="bh-streak-val">🔥 ${b.streak}</div>
        <div class="bh-streak-lbl">streak</div>
      </div>
    `;
    list.appendChild(item);
  });
}

function renderOverview(overview) {
  setText('ovCompleted', overview.completed_tasks);
  setText('ovMissed',    overview.missed_tasks);
  setText('ovPending',   overview.pending_tasks);
  setText('stackedTotal', overview.total_tasks);

  const bar = document.getElementById('stackedBar');
  if (!bar || !overview.total_tasks) return;
  const total = overview.total_tasks;
  bar.innerHTML = `
    <div class="stacked-seg" style="width:${pct(overview.completed_tasks, total)}%;background:#2d8a4e;"></div>
    <div class="stacked-seg" style="width:${pct(overview.missed_tasks, total)}%;background:#e57373;"></div>
    <div class="stacked-seg" style="width:${pct(overview.pending_tasks, total)}%;background:#ffa726;"></div>
  `;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function show(id) { document.getElementById(id)?.classList.remove('d-none'); }
function hide(id) { document.getElementById(id)?.classList.add('d-none'); }
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function pct(n, total) {
  return total > 0 ? Math.round(n / total * 100) : 0;
}
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
