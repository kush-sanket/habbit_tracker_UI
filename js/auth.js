/**
 * auth.js — Login & Register form handlers for index.html
 * Depends on: api.js (API, Auth)
 */
$(function () {
  // Redirect to dashboard if already logged in
  if (Auth.isLoggedIn()) {
    window.location.href = 'dashboard.html';
    return;
  }

  // ── Tab switching ────────────────────────────────────────────────────────
  $('#authTabs .nav-link').on('click', function () {
    const tab = $(this).data('tab');
    $('#authTabs .nav-link').removeClass('active');
    $(this).addClass('active');
    clearAlert();

    if (tab === 'login') {
      $('#loginForm').removeClass('d-none');
      $('#registerForm').addClass('d-none');
    } else {
      $('#loginForm').addClass('d-none');
      $('#registerForm').removeClass('d-none');
    }
  });

  // ── Helpers ──────────────────────────────────────────────────────────────
  function showAlert(msg, type = 'danger') {
    $('#authAlert')
      .removeClass('d-none alert-danger alert-success alert-warning')
      .addClass(`alert-${type}`)
      .text(msg);
  }

  function clearAlert() {
    $('#authAlert').addClass('d-none').text('');
  }

  function setLoading(btnId, loading) {
    const btn = $(`#${btnId}`);
    btn.find('.btn-text').toggleClass('d-none', loading);
    btn.find('.spinner-border').toggleClass('d-none', !loading);
    btn.prop('disabled', loading);
  }

  function _extractError(err) {
    if (err.data) {
      const msgs = [];
      for (const [field, val] of Object.entries(err.data)) {
        if (Array.isArray(val)) msgs.push(`${field}: ${val.join(', ')}`);
        else msgs.push(val);
      }
      return msgs.join(' | ');
    }
    return err.message || 'Something went wrong.';
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  $('#loginForm').on('submit', async function (e) {
    e.preventDefault();
    clearAlert();
    setLoading('loginBtn', true);

    const email    = $('#loginEmail').val().trim();
    const password = $('#loginPassword').val();

    try {
      const data = await API.login({ email, password });
      Auth.setTokens(data.access, data.refresh);
      Auth.setUser(data.user);
      window.location.href = 'dashboard.html';
    } catch (err) {
      showAlert(_extractError(err));
    } finally {
      setLoading('loginBtn', false);
    }
  });

  // ── Register ─────────────────────────────────────────────────────────────
  $('#registerForm').on('submit', async function (e) {
    e.preventDefault();
    clearAlert();

    const password  = $('#regPassword').val();
    const password2 = $('#regPassword2').val();
    if (password !== password2) {
      showAlert('Passwords do not match.');
      return;
    }

    setLoading('registerBtn', true);
    try {
      await API.register({
        username  : $('#regUsername').val().trim(),
        email     : $('#regEmail').val().trim(),
        password,
        password2,
      });
      showAlert('Account created! Please log in.', 'success');
      // Auto-switch to login tab
      $('#authTabs .nav-link[data-tab="login"]').trigger('click');
    } catch (err) {
      showAlert(_extractError(err));
    } finally {
      setLoading('registerBtn', false);
    }
  });
});
