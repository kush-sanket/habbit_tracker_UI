/**
 * dashboard.js — Orchestrates API → tree render → detail panels
 * Depends on: api.js (API, Auth), tree-renderer.js (TreeRenderer)
 */
$(function () {
  // Guard: require auth
  if (!Auth.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let _treeState  = null;   // latest /tree-state/ response
  let _categories = [];     // /categories/ response

  const addBranchModal = new bootstrap.Modal('#addBranchModal');
  const addTaskModal   = new bootstrap.Modal('#addTaskModal');
  const rerouteModal   = new bootstrap.Modal('#rerouteModal');

  // ── Boot ─────────────────────────────────────────────────────────────────
  init();

  async function init() {
    const user = Auth.getUser();
    if (user) {
      $('#usernameLabel').text(`👤 ${user.username || user.email}`);
      _updatePrivacyBtn(user.is_public);
    }
    await Promise.all([loadTreeState(), loadCategories()]);
  }

  // ── Tree state ────────────────────────────────────────────────────────────
  async function loadTreeState() {
    showTreeLoading(true);
    try {
      _treeState = await API.getTreeState();
      renderTree();
      updateTopBar();
    } catch (err) {
      console.error('loadTreeState failed', err);
    } finally {
      showTreeLoading(false);
    }
  }

  function renderTree() {
    if (!_treeState) return;

    const allBranches = (_treeState.categories || []).flatMap(c => c.branches || []);
    if (allBranches.length === 0) {
      $('#treeEmpty').removeClass('d-none');
      return;
    }
    $('#treeEmpty').addClass('d-none');

    const svgEl = document.getElementById('tree-canvas');
    TreeRenderer.render(_treeState, svgEl, {
      onBranchClick: openBranchPanel,
      onTaskClick  : (taskId, branchId) => openTaskPanel(taskId, branchId),
    });

  }

  function updateTopBar() {
    if (!_treeState) return;
    const { stats, user } = _treeState;
    if (user) {
      $('#usernameLabel').text(`👤 ${user.username || user.email}`);
      _updatePrivacyBtn(user.is_public);
      Auth.setUser(user);
    }
    if (stats) {
      const stageMap = {
        seed: '🌰 Seed', seedling: '🌱 Seedling', sapling: '🪴 Sapling',
        young_tree: '🌿 Young Tree', mature_tree: '🌳 Mature Tree',
      };
      $('#stageLabel').text(stageMap[stats.tree_stage] || stats.tree_stage || '');
      $('#streakBadge').text(`🔥 ${stats.current_streak ?? '—'}`);
      $('#highestStreakBadge').text(`Best: ${stats.highest_streak ?? '—'}`);
    }
  }

  function showTreeLoading(show) {
    if (show) {
      $('#treeLoading').removeClass('d-none');
      $('#tree-canvas').hide();
    } else {
      $('#treeLoading').addClass('d-none');
      $('#tree-canvas').show();
    }
  }

  // ── Categories ────────────────────────────────────────────────────────────
  async function loadCategories() {
    try {
      const data = await API.getCategories();
      _categories = Array.isArray(data) ? data : (data.results || []);
      _populateCategorySelect();
    } catch (err) {
      console.error('loadCategories failed', err);
    }
  }

  function _populateCategorySelect() {
    const sel = $('#branchCategory').empty();
    _categories.forEach(c => {
      sel.append($('<option>').val(c.id).text(`${c.icon} ${c.name}`));
    });
  }

  // ── Detail Panel helpers ──────────────────────────────────────────────────
  function openDetailPanel(title, html) {
    $('#panelTitle').text(title);
    $('#panelBody').html(html);
    $('#detailPanel').removeClass('d-none');
  }

  $('#closePanelBtn').on('click', () => $('#detailPanel').addClass('d-none'));

  // ── Branch Panel ──────────────────────────────────────────────────────────
  function openBranchPanel(branchId) {
    if (!_treeState) return;
    const branch = _findBranch(branchId);
    if (!branch) return;

    const health   = parseFloat(branch.health_score || 0);
    const healthPct = Math.round(health * 100);
    const healthBadge = health > 0.7 ? 'success' : health >= 0.4 ? 'warning' : 'danger';

    const tasks   = branch.tasks || [];
    const pending   = tasks.filter(t => t.status === 'pending');
    const completed = tasks.filter(t => t.status === 'completed');
    const missed    = tasks.filter(t => t.status === 'missed');

    function taskItem(t) {
      const statusBadge = { pending: 'secondary', completed: 'success', missed: 'danger' };
      return `<a href="#" class="list-group-item list-group-item-action task-detail-link" data-task-id="${t.id}" data-branch-id="${branch.id}">
        <div class="d-flex justify-content-between align-items-center">
          <span>${t.title}</span>
          <span class="badge bg-${statusBadge[t.status] || 'secondary'}">${t.status}</span>
        </div>
        <small class="text-muted">${t.frequency} · due ${t.due_date || '–'}</small>
      </a>`;
    }

    function taskGroup(label, list) {
      if (!list.length) return '';
      return `<p class="text-muted small mb-1 mt-3">${label}</p>
        <div class="list-group list-group-flush mb-2">${list.map(taskItem).join('')}</div>`;
    }

    const html = `
      <div class="mb-3">
        <h5 class="mb-1">${branch.name}</h5>
        <span class="badge bg-${healthBadge}">Health ${healthPct}%</span>
        <span class="badge bg-info ms-1">🔥 Streak ${branch.streak}</span>
        <span class="badge bg-secondary ms-1">Best ${branch.best_streak}</span>
      </div>
      <div class="mb-3">
        <div class="d-flex justify-content-between small text-muted">
          <span>${branch.completed_tasks} / ${branch.total_tasks} tasks done</span>
        </div>
        <div class="progress mt-1" style="height:6px">
          <div class="progress-bar bg-${healthBadge}" style="width:${healthPct}%"></div>
        </div>
      </div>
      <button class="btn btn-sm btn-outline-success w-100 mb-3 add-task-btn" data-branch-id="${branch.id}">
        + Add Task to this Branch
      </button>
      ${taskGroup('⏳ Pending', pending)}
      ${taskGroup('✅ Completed', completed)}
      ${taskGroup('❌ Missed', missed)}
    `;

    openDetailPanel(branch.name, html);
  }

  // ── Task Panel ─────────────────────────────────────────────────────────────
  function openTaskPanel(taskId) {
    const task = _findTask(taskId);
    if (!task) return;

    const statusBadge = { pending: 'secondary', completed: 'success', missed: 'danger' };
    const isPending  = task.status === 'pending';
    const isMissed   = task.status === 'missed';
    // Reroute is only available once per task — when it has been missed and not yet rerouted
    const canReroute = isMissed && task.reroute_count === 0;

    let actionHtml = '';
    if (isPending) {
      actionHtml = `
        <div class="d-flex gap-2 flex-wrap mt-3">
          <button class="btn btn-success btn-sm action-complete" data-task-id="${task.id}">✅ Complete</button>
          <button class="btn btn-danger btn-sm action-miss" data-task-id="${task.id}">❌ Miss</button>
        </div>`;
    } else if (canReroute) {
      actionHtml = `
        <div class="mt-3">
          <p class="text-danger small mb-2">This task was missed. You can reroute it once.</p>
          <button class="btn btn-warning btn-sm action-reroute" data-task-id="${task.id}">🔀 Reroute Task</button>
        </div>`;
    } else if (isMissed) {
      actionHtml = '<p class="text-muted small mt-3">This task was missed and has already been rerouted.</p>';
    } else {
      actionHtml = '<p class="text-muted small mt-3">No actions available for this task.</p>';
    }

    const html = `
      <div class="mb-3">
        <h5>${task.title}</h5>
        <span class="badge bg-${statusBadge[task.status] || 'secondary'}">${task.status}</span>
        <span class="badge bg-info ms-1">${task.frequency}</span>
      </div>
      <p class="text-muted small">Due: ${task.due_date || '—'}</p>
      ${task.completed_at ? `<p class="text-muted small">Completed: ${task.completed_at}</p>` : ''}
      ${actionHtml}
    `;

    openDetailPanel(task.title, html);
  }

  // ── Panel action delegation ───────────────────────────────────────────────
  // Back to branch
  $('#panelBody').on('click', '.back-to-branch', function () {
    openBranchPanel($(this).data('branch-id'));
  });

  // Task list row click
  $('#panelBody').on('click', '.task-detail-link', function (e) {
    e.preventDefault();
    openTaskPanel($(this).data('task-id'), $(this).data('branch-id'));
  });

  $('#panelBody').on('click', '.add-task-btn', function () {
    const branchId = $(this).data('branch-id');
    openAddTaskModal(branchId);
  });

  $('#panelBody').on('click', '.action-complete', async function () {
    const taskId = $(this).data('task-id');
    try {
      await API.completeTask(taskId);
      await loadTreeState();
      $('#detailPanel').addClass('d-none');
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  });

  $('#panelBody').on('click', '.action-miss', async function () {
    const taskId = $(this).data('task-id');
    try {
      await API.missTask(taskId);
      await loadTreeState();
      $('#detailPanel').addClass('d-none');
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  });

  $('#panelBody').on('click', '.action-reroute', function () {
    const taskId = $(this).data('task-id');
    const task   = _findTask(taskId);
    $('#rerouteTaskId').val(taskId);
    $('#rerouteTitle').val(task ? task.title : '');
    $('#rerouteReason').val('');
    // Reroute due date must be in the future
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    $('#rerouteDueDate').val('').attr('min', tomorrow.toISOString().split('T')[0]);
    _clearModalAlert('#rerouteModalAlert');
    rerouteModal.show();
  });

  // ── Reroute confirm ───────────────────────────────────────────────────────
  $('#confirmRerouteBtn').on('click', async function () {
    const taskId  = $('#rerouteTaskId').val();
    const title   = $('#rerouteTitle').val().trim();
    const reason  = $('#rerouteReason').val().trim();
    const dueDate = $('#rerouteDueDate').val();

    if (!title || !reason || !dueDate) {
      _showModalAlert('#rerouteModalAlert', 'All fields are required.', 'warning');
      return;
    }

    try {
      await API.rerouteTask(taskId, { title, reason, due_date: dueDate });
      rerouteModal.hide();
      await loadTreeState();
      $('#detailPanel').addClass('d-none');
    } catch (err) {
      _showModalAlert('#rerouteModalAlert', err.message, 'danger');
    }
  });

  // ── Add Branch ────────────────────────────────────────────────────────────
  $('#fabAddBranch, #emptyAddBranchBtn').on('click', () => {
    _clearModalAlert('#branchModalAlert');
    $('#branchName').val('');
    $('#branchDesc').val('');
    addBranchModal.show();
  });

  $('#saveBranchBtn').on('click', async function () {
    const category    = $('#branchCategory').val();
    const name        = $('#branchName').val().trim();
    const description = $('#branchDesc').val().trim();

    if (!name) {
      _showModalAlert('#branchModalAlert', 'Branch name is required.', 'warning');
      return;
    }

    try {
      await API.createBranch({ category, name, description });
      addBranchModal.hide();
      await loadTreeState();
    } catch (err) {
      _showModalAlert('#branchModalAlert', err.message, 'danger');
    }
  });

  // ── Add Task ──────────────────────────────────────────────────────────────
  function openAddTaskModal(branchId) {
    _clearModalAlert('#taskModalAlert');
    $('#taskBranchId').val(branchId);
    $('#taskTitle').val('');
    $('#taskFrequency').val('daily');
    // Enforce min = today so past dates can't be chosen
    const today = new Date().toISOString().split('T')[0];
    $('#taskDueDate').val('').attr('min', today);
    addTaskModal.show();
  }

  $('#saveTaskBtn').on('click', async function () {
    const branch    = $('#taskBranchId').val();
    const title     = $('#taskTitle').val().trim();
    const frequency = $('#taskFrequency').val();
    const due_date  = $('#taskDueDate').val();

    if (!title || !due_date) {
      _showModalAlert('#taskModalAlert', 'Title and due date are required.', 'warning');
      return;
    }

    try {
      await API.createTask({ branch, title, frequency, due_date });
      addTaskModal.hide();
      await loadTreeState();
    } catch (err) {
      _showModalAlert('#taskModalAlert', err.message, 'danger');
    }
  });

  // ── Privacy ───────────────────────────────────────────────────────────────
  $('#privacyBtn').on('click', async function () {
    try {
      const data = await API.togglePrivacy();
      _updatePrivacyBtn(data.is_public);
      const user = Auth.getUser() || {};
      user.is_public = data.is_public;
      Auth.setUser(user);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  });

  function _updatePrivacyBtn(isPublic) {
    $('#privacyBtn').text(isPublic ? '🔓 Public' : '🔒 Private');
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  $('#logoutBtn').on('click', async function () {
    try { await API.logout(); } catch { /* swallow */ }
    Auth.clear();
    window.location.href = 'index.html';
  });

  // ── Window resize re-render ───────────────────────────────────────────────
  $(window).on('resize', _debounce(renderTree, 250));

  // ── Lookup helpers ────────────────────────────────────────────────────────
  function _findBranch(branchId) {
    if (!_treeState) return null;
    for (const cat of (_treeState.categories || [])) {
      const b = (cat.branches || []).find(b => b.id === branchId);
      if (b) return b;
    }
    return null;
  }

  function _findTask(taskId) {
    if (!_treeState) return null;
    for (const cat of (_treeState.categories || [])) {
      for (const b of (cat.branches || [])) {
        const t = (b.tasks || []).find(t => t.id === taskId);
        if (t) return t;
      }
    }
    return null;
  }

  // ── Modal alert helpers ───────────────────────────────────────────────────
  function _showModalAlert(selector, msg, type = 'danger') {
    $(selector).removeClass('d-none alert-danger alert-warning alert-success')
      .addClass(`alert-${type}`).text(msg);
  }

  function _clearModalAlert(selector) {
    $(selector).addClass('d-none').text('');
  }

  // ── Debounce ──────────────────────────────────────────────────────────────
  function _debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }
});
