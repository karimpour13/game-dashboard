// ================== توابع کمکی ==================
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m;
  });
}

// ================== متغیرها ==================
let allUsers = [];
let currentUsersPage = 1;
const USERS_LIMIT = 10;
let editingUserId = null;
let editingGameNetId = null;

// ================== نمایش/مخفی کردن بخش گیم‌نت بر اساس نقش ==================
document.addEventListener('DOMContentLoaded', function () {
  // بررسی نقش کاربر
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.role !== 'superAdmin') {
    window.location.href = '/';
    return;
  }

  // رویداد تغییر نقش در فرم
  const roleSelect = document.getElementById('userRole');
  if (roleSelect) {
    roleSelect.addEventListener('change', toggleGameNetSection);
  }

  // بارگذاری اولیه کاربران
  loadUsers(1);
});

function toggleGameNetSection() {
  const role = document.getElementById('userRole').value;
  const section = document.getElementById('gameNetSection');
  const nameInput = document.getElementById('gameNetName');
  const expiryInput = document.getElementById('gameNetExpiresAt');

  if (role === 'superAdmin') {
    section.style.display = 'none';
    nameInput.removeAttribute('required');
    expiryInput.removeAttribute('required');
  } else {
    section.style.display = 'block';
    nameInput.setAttribute('required', 'required');
    expiryInput.setAttribute('required', 'required');
  }
}

// ================== بارگذاری کاربران ==================
async function loadUsers(page = 1) {
  currentUsersPage = page;
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML =
    '<tr><td colspan="8" style="text-align: center; padding: 40px;">⏳ در حال بارگذاری...</td></tr>';

  try {
    const users = await apiFetch('/api/v1/users');
    allUsers = users || [];

    // دریافت اطلاعات گیم‌نت‌ها برای هر کاربر
    const usersWithGameNets = await Promise.all(
      allUsers.map(async (user) => {
        if (user.gameNetId) {
          try {
            const gameNetId =
              typeof user.gameNetId === 'object'
                ? user.gameNetId._id
                : user.gameNetId;
            const gameNet = await apiFetch(`/api/v1/gameNets/${gameNetId}`);
            return { ...user, gameNet };
          } catch {
            return { ...user, gameNet: null };
          }
        }
        return { ...user, gameNet: null };
      })
    );

    const totalUsers = usersWithGameNets.length;
    const totalPages = Math.ceil(totalUsers / USERS_LIMIT);
    const start = (page - 1) * USERS_LIMIT;
    const end = start + USERS_LIMIT;
    const pageUsers = usersWithGameNets.slice(start, end);

    renderUsersTable(pageUsers);
    renderUsersPagination(totalPages, page);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--warning);">❌ خطا در بارگذاری: ${err.message}</td></tr>`;
  }
}

// ================== رندر جدول کاربران ==================
function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (!users || users.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">هیچ کاربری یافت نشد.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  users.forEach((user, index) => {
    const row = tbody.insertRow();
    const rowNum = (currentUsersPage - 1) * USERS_LIMIT + index + 1;

    row.insertCell(0).innerHTML =
      `<div style="text-align: center;">${rowNum}</div>`;
    row.insertCell(1).innerHTML =
      `<div style="text-align: right; font-weight: 500;">${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}</div>`;
    row.insertCell(2).innerHTML =
      `<div style="text-align: right;">${escapeHtml(user.username)}</div>`;
    row.insertCell(3).innerHTML =
      `<div style="text-align: right;">${escapeHtml(user.email)}</div>`;

    const role = user.role === 'superAdmin' ? 'سوپرادمین' : 'ادمین';
    const roleClass =
      user.role === 'superAdmin' ? 'user-role-superAdmin' : 'user-role-admin';
    row.insertCell(4).innerHTML =
      `<div style="text-align: center;"><span class="user-role-badge ${roleClass}">${role}</span></div>`;

    // اطلاعات گیم‌نت
    let gameNetInfo = '-';
    if (user.gameNet) {
      gameNetInfo = `
        <div style="font-weight: bold; color: var(--primary);">${escapeHtml(user.gameNet.name)}</div>
        <div style="font-size: 0.7rem; color: var(--text-muted);">${user.gameNet.isActive ? '✅ فعال' : '❌ غیرفعال'}</div>
        <div style="font-size: 0.7rem; color: var(--text-muted);">انقضا: ${new Date(user.gameNet.expiresAt).toLocaleDateString('fa-IR')}</div>
      `;
    } else if (user.role === 'superAdmin') {
      gameNetInfo =
        '<span style="color: var(--secondary);">🌐 دسترسی به همه</span>';
    }
    row.insertCell(5).innerHTML =
      `<div style="text-align: center;">${gameNetInfo}</div>`;

    const statusText = user.isActive ? 'فعال' : 'غیرفعال';
    const statusClass = user.isActive
      ? 'user-status-active'
      : 'user-status-inactive';
    row.insertCell(6).innerHTML =
      `<div style="text-align: center;"><span class="user-status-badge ${statusClass}">${statusText}</span></div>`;

    const actionsCell = row.insertCell(7);
    actionsCell.style.textAlign = 'center';
    actionsCell.innerHTML = `
      <button class="user-action-btn user-action-edit" onclick="openEditUserModal('${user._id}')">✎ ویرایش</button>
      <button class="user-action-btn user-action-delete" onclick="deleteUser('${user._id}')">🗑️ حذف</button>
    `;
  });
}

// ================== Pagination ==================
function renderUsersPagination(totalPages, currentPage) {
  const container = document.getElementById('usersPagination');
  if (!container) return;
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  html += `<button class="btn-pagination" onclick="loadUsers(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>‹ قبلی</button>`;

  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, currentPage + 2);

  if (startPage > 1) {
    html += `<button class="btn-pagination" onclick="loadUsers(1)">1</button>`;
    if (startPage > 2) html += `<span class="pagination-ellipsis">...</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    const active = i === currentPage ? 'active' : '';
    html += `<button class="btn-pagination ${active}" onclick="loadUsers(${i})" ${active ? 'disabled' : ''}>${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1)
      html += `<span class="pagination-ellipsis">...</span>`;
    html += `<button class="btn-pagination" onclick="loadUsers(${totalPages})">${totalPages}</button>`;
  }

  html += `<button class="btn-pagination" onclick="loadUsers(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>بعدی ›</button>`;
  container.innerHTML = html;
}

// ================== مودال افزودن/ویرایش ==================
function openAddUserModal() {
  editingUserId = null;
  editingGameNetId = null;
  document.getElementById('userFormTitle').innerText =
    '➕ افزودن کاربر جدید به همراه گیم‌نت';
  document.getElementById('userForm').reset();
  document.getElementById('editUserId').value = '';
  document.getElementById('editGameNetId').value = '';
  document.getElementById('userPassword').required = true;
  document.getElementById('passwordFieldGroup').style.display = 'block';
  document.getElementById('userFormStatus').innerHTML = '';

  const defaultExpiry = new Date();
  defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1);
  const expiryInput = document.getElementById('gameNetExpiresAt');
  if (expiryInput) {
    expiryInput.value = defaultExpiry.toISOString().slice(0, 16);
  }

  document.getElementById('gameNetSection').style.display = 'block';
  document.getElementById('gameNetName').setAttribute('required', 'required');
  document
    .getElementById('gameNetExpiresAt')
    .setAttribute('required', 'required');

  document.getElementById('userFormModal').style.display = 'flex';
}

async function openEditUserModal(userId) {
  editingUserId = userId;
  document.getElementById('userFormTitle').innerText =
    '✏️ ویرایش کاربر و گیم‌نت';
  document.getElementById('editUserId').value = userId;
  document.getElementById('userPassword').required = false;
  document.getElementById('passwordFieldGroup').style.display = 'block';
  document.getElementById('userFormStatus').innerHTML = '';

  try {
    const users = await apiFetch('/api/v1/users');
    const user = users.find((u) => u._id === userId);
    if (!user) throw new Error('کاربر یافت نشد');

    document.getElementById('userFirstName').value = user.firstName || '';
    document.getElementById('userLastName').value = user.lastName || '';
    document.getElementById('userUsername').value = user.username || '';
    document.getElementById('userEmail').value = user.email || '';
    document.getElementById('userRole').value = user.role || 'admin';
    document.getElementById('userStatus').value = user.isActive
      ? 'true'
      : 'false';
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword').placeholder =
      '•••••••• (برای تغییر وارد کنید)';
    if (user.expiresAt) {
      const date = new Date(user.expiresAt);
      document.getElementById('userExpiresAt').value = date
        .toISOString()
        .slice(0, 16);
    } else {
      document.getElementById('userExpiresAt').value = '';
    }

    const section = document.getElementById('gameNetSection');
    if (user.gameNetId) {
      const gameNetId =
        typeof user.gameNetId === 'object'
          ? user.gameNetId._id
          : user.gameNetId;
      const gameNet = await apiFetch(`/api/v1/gameNets/${gameNetId}`);
      editingGameNetId = gameNet._id;
      document.getElementById('editGameNetId').value = gameNet._id;
      document.getElementById('gameNetName').value = gameNet.name || '';
      document.getElementById('gameNetPhone').value = gameNet.phone || '';
      document.getElementById('gameNetAddress').value = gameNet.address || '';
      if (gameNet.expiresAt) {
        const date = new Date(gameNet.expiresAt);
        document.getElementById('gameNetExpiresAt').value = date
          .toISOString()
          .slice(0, 16);
      }
      document.getElementById('gameNetStatus').value = gameNet.isActive
        ? 'true'
        : 'false';
      document.getElementById('gameNetPriceUnit').value =
        gameNet.settings?.priceUnit || 'Toman';
      document.getElementById('gameNetMinHour').value = gameNet.settings
        ?.useMinimumHour
        ? 'true'
        : 'false';
      document.getElementById('gameNetRoundDown').value = gameNet.settings
        ?.useRoundDownPrice
        ? 'true'
        : 'false';
      document.getElementById('gameNetRoundUp').value = gameNet.settings
        ?.useRoundUpPrice
        ? 'true'
        : 'false';
      document.getElementById('gameNetTheme').value = gameNet.theme || 'dark';
      document.getElementById('gameNetSystemPassword').value = '';
      document.getElementById('gameNetSystemPassword').placeholder =
        '•••••••• (برای تغییر وارد کنید)';

      section.style.display = 'block';
      document
        .getElementById('gameNetName')
        .setAttribute('required', 'required');
      document
        .getElementById('gameNetExpiresAt')
        .setAttribute('required', 'required');
    } else {
      section.style.display = 'none';
      document.getElementById('gameNetName').removeAttribute('required');
      document.getElementById('gameNetExpiresAt').removeAttribute('required');
    }

    document.getElementById('userFormModal').style.display = 'flex';
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}

function closeUserFormModal() {
  document.getElementById('userFormModal').style.display = 'none';
  document.getElementById('editUserId').value = '';
  document.getElementById('editGameNetId').value = '';
  document.getElementById('userPassword').value = '';
  clearAllFieldErrors(); // ← اضافه کنید
}

// ================== ارسال فرم ==================
document
  .getElementById('userForm')
  ?.addEventListener('submit', async function (e) {
    e.preventDefault();

    // ========== پاک کردن خطاهای قبلی ==========
    clearAllFieldErrors();

    const statusDiv = document.getElementById('userFormStatus');
    statusDiv.innerHTML =
      '<span style="color: var(--success);">⏳ در حال ذخیره...</span>';

    const userId = document.getElementById('editUserId').value;
    const gameNetId = document.getElementById('editGameNetId').value;

    const userData = {
      firstName: document.getElementById('userFirstName').value.trim(),
      lastName: document.getElementById('userLastName').value.trim(),
      username: document.getElementById('userUsername').value.trim(),
      email: document.getElementById('userEmail').value.trim(),
      role: document.getElementById('userRole').value,
      password: document.getElementById('userPassword').value,
      isActive: document.getElementById('userStatus').value === 'true',
      expiresAt: document.getElementById('userExpiresAt').value || null,
    };

    // اعتبارسنجی ساده سمت کلاینت
    let hasClientError = false;
    if (!userData.firstName) {
      showFieldError('firstNameError', 'نام الزامی است');
      hasClientError = true;
    }
    if (!userData.lastName) {
      showFieldError('lastNameError', 'نام خانوادگی الزامی است');
      hasClientError = true;
    }
    if (!userData.username) {
      showFieldError('usernameError', 'نام کاربری الزامی است');
      hasClientError = true;
    }
    if (!userData.email) {
      showFieldError('emailError', 'ایمیل الزامی است');
      hasClientError = true;
    }
    const emailRegex = /^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/;
    if (userData.email && !emailRegex.test(userData.email)) {
      showFieldError('emailError', 'ایمیل معتبر وارد کنید');
      hasClientError = true;
    }
    if (!userId && !userData.password) {
      showFieldError('passwordError', 'برای کاربر جدید، رمز عبور الزامی است');
      hasClientError = true;
    }

    let gameNetData = null;
    if (userData.role === 'admin') {
      gameNetData = {
        name: document.getElementById('gameNetName').value.trim(),
        phone: document.getElementById('gameNetPhone').value.trim(),
        address: document.getElementById('gameNetAddress').value.trim(),
        expiresAt: document.getElementById('gameNetExpiresAt').value,
        isActive: document.getElementById('gameNetStatus').value === 'true',
        settings: {
          priceUnit: document.getElementById('gameNetPriceUnit').value,
          useMinimumHour:
            document.getElementById('gameNetMinHour').value === 'false',
          useRoundDownPrice:
            document.getElementById('gameNetRoundDown').value === 'false',
          useRoundUpPrice:
            document.getElementById('gameNetRoundUp').value === 'false',
        },
      };

      const systemPassword = document.getElementById(
        'gameNetSystemPassword'
      ).value;
      if (systemPassword) gameNetData.settings.systemPassword = systemPassword;

      if (!gameNetData.name) {
        showFieldError('gameNetNameError', 'نام گیم‌نت الزامی است');
        hasClientError = true;
      }
      if (!gameNetData.expiresAt) {
        showFieldError(
          'gameNetExpiresAtError',
          'تاریخ انقضای گیم‌نت الزامی است'
        );
        hasClientError = true;
      }
    }
    if (hasClientError) {
      statusDiv.innerHTML = '';
      // اسکرول به اولین خطا
      const firstError = document.querySelector('.field-error.show');
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    try {
      if (userId) {
        if (userData.role === 'admin' && gameNetId) {
          await apiFetch(`/api/v1/gameNets/${gameNetId}`, {
            method: 'PUT',
            body: JSON.stringify({
              name: gameNetData.name,
              phone: gameNetData.phone,
              address: gameNetData.address,
              expiresAt: gameNetData.expiresAt,
              isActive: gameNetData.isActive,
              settings: gameNetData.settings,
              theme: gameNetData.theme,
            }),
          });
        } else if (userData.role === 'admin' && !gameNetId) {
          throw new Error('ادمین باید دارای گیم‌نت باشد');
        }

        await apiFetch(`/api/v1/users/${userId}`, {
          method: 'PUT',
          body: JSON.stringify(userData),
        });
      } else {
        if (userData.role === 'admin') {
          await apiFetch('/api/v1/users/with-gamnet', {
            method: 'POST',
            body: JSON.stringify({ userData, gameNetData }),
          });
        } else {
          await apiFetch('/api/v1/users', {
            method: 'POST',
            body: JSON.stringify(userData),
          });
        }
      }

      statusDiv.innerHTML =
        '<span style="color: var(--success);">✅ کاربر با موفقیت ذخیره شد</span>';
      closeUserFormModal();
      await loadUsers(currentUsersPage);
    } catch (err) {
      statusDiv.innerHTML = `<span style="color: var(--warning);">⚠️ ${err.message}</span>`;
    }
  });

// ================== توابع کمکی مدیریت خطاهای فیلد ==================
function showFieldError(elementId, message) {
  const errorEl = document.getElementById(elementId);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add('show');
    // اضافه کردن کلاس error به parent (input-group)
    const parent = errorEl.closest('.input-group');
    if (parent) parent.classList.add('error');
  }
}

function clearAllFieldErrors() {
  document.querySelectorAll('.field-error').forEach((el) => {
    el.textContent = '';
    el.classList.remove('show');
    const parent = el.closest('.input-group');
    if (parent) parent.classList.remove('error');
  });
}

function handleServerErrors(errorMessage) {
  // تلاش برای تشخیص فیلد مربوطه از پیام خطا
  const errorMap = {
    'نام کاربری': 'usernameError',
    ایمیل: 'emailError',
    'گیم‌نت با نام': 'gameNetNameError',
    'نام گیم‌نت': 'gameNetNameError',
    'رمز عبور': 'passwordError',
  };

  let found = false;
  for (const [key, elementId] of Object.entries(errorMap)) {
    if (errorMessage.includes(key)) {
      showFieldError(elementId, errorMessage);
      found = true;
      break;
    }
  }

  // اگر خطا به فیلد خاصی مربوط نبود، در status نمایش بده
  if (!found) {
    const statusDiv = document.getElementById('userFormStatus');
    statusDiv.innerHTML = `<span style="color: var(--warning);">⚠️ ${errorMessage}</span>`;
  }
}
// ================== حذف کاربر ==================
async function deleteUser(userId) {
  const confirmed = await customConfirm('آیا از حذف این کاربر مطمئن هستید؟');
  if (!confirmed) return;

  try {
    await apiFetch(`/api/v1/users/${userId}`, { method: 'DELETE' });
    customAlert('✅ کاربر با موفقیت حذف شد');
    await loadUsers(currentUsersPage);
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}
