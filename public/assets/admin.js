// public/assets/admin.js

function getAuthHeaders() {
  const token = localStorage.getItem('tc_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

document.addEventListener('DOMContentLoaded', async () => {
  // 鉴权
  const res = await fetch('/api/auth/check', { credentials: 'include', headers: getAuthHeaders() });
  if (!res.ok) { window.location.href = '/login.html'; return; }

  const role = localStorage.getItem('tc_role');
  if (role !== 'admin') {
    alert('需要管理员权限');
    window.location.href = '/index.html';
    return;
  }

  loadSettings();
  loadStats();
  updateWebdavInfo();
});

function showSection(sectionId) {
  document.querySelectorAll('.settings-section').forEach((s) => (s.style.display = 'none'));
  document.querySelectorAll('.folder-item').forEach((i) => i.classList.remove('active'));
  document.getElementById(`section-${sectionId}`).style.display = 'block';
  document.querySelector(`[data-sec="${sectionId}"]`).classList.add('active');
}

async function loadSettings() {
  const res = await fetch('/api/settings', { credentials: 'include', headers: getAuthHeaders() });
  if (!res.ok) return;
  const settings = await res.json();

  if (settings.siteName) document.getElementById('siteName').value = settings.siteName;
  if (settings.maxFileSizeGB) document.getElementById('maxFileSizeGB').value = settings.maxFileSizeGB;
  if (settings.language) document.getElementById('language').value = settings.language;
  if (settings.theme) {
    setTheme(settings.theme);
    document.querySelectorAll('.theme-option').forEach((o) => o.classList.toggle('active', o.dataset.theme === settings.theme));
  }
  if (settings.bgImageUrl) document.getElementById('bgImageUrl').value = settings.bgImageUrl;
  if (settings.allowPublicUpload) document.getElementById('allowPublicUpload').checked = settings.allowPublicUpload;

  localStorage.setItem('tc_settings', JSON.stringify(settings));
}

async function saveSettings() {
  const statusEl = document.getElementById('saveStatus');
  const updates = {
    siteName: document.getElementById('siteName').value,
    maxFileSizeGB: parseInt(document.getElementById('maxFileSizeGB').value),
    language: document.getElementById('language').value,
    allowPublicUpload: document.getElementById('allowPublicUpload').checked,
    bgImageUrl: document.getElementById('bgImageUrl').value,
  };

  const adminPassword = document.getElementById('adminPassword').value;
  if (adminPassword) updates.adminPassword = adminPassword;

  const uploadPassword = document.getElementById('uploadPassword').value;
  if (uploadPassword) updates.uploadPassword = uploadPassword;

  const tgBotToken = document.getElementById('tgBotToken').value;
  if (tgBotToken) updates.tgBotToken = tgBotToken;

  const tgChannelId = document.getElementById('tgChannelId').value;
  if (tgChannelId) updates.tgChannelId = tgChannelId;

  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(updates),
    credentials: 'include',
  });

  statusEl.style.display = 'block';
  if (res.ok) {
    statusEl.className = 'status-msg success';
    statusEl.textContent = '✅ 设置已保存';
    localStorage.setItem('tc_settings', JSON.stringify(updates));
  } else {
    statusEl.className = 'status-msg error';
    statusEl.textContent = '❌ 保存失败';
  }
  setTimeout(() => (statusEl.style.display = 'none'), 3000);
}

async function testTelegramConnection() {
  const badge = document.getElementById('storageStatus');
  badge.textContent = '测试中...';
  badge.className = 'status-badge';

  const token = document.getElementById('tgBotToken').value;
  if (!token) {
    badge.textContent = '请填写 Bot Token';
    badge.className = 'status-badge error';
    return;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    if (data.ok) {
      badge.textContent = `✅ 已连接: @${data.result.username}`;
      badge.className = 'status-badge ok';
    } else {
      badge.textContent = `❌ ${data.description}`;
      badge.className = 'status-badge error';
    }
  } catch (e) {
    badge.textContent = `❌ ${e.message}`;
    badge.className = 'status-badge error';
  }
}

async function loadStats() {
  try {
    const [fRes, filesRes] = await Promise.all([
      fetch('/api/folders', { credentials: 'include', headers: getAuthHeaders() }),
      fetch('/api/files?folderId=root', { credentials: 'include', headers: getAuthHeaders() }),
    ]);

    const fData = await fRes.json();
    document.getElementById('totalFolders').textContent = (fData.folders || []).length;

    const fData2 = await filesRes.json();
    const files = fData2.files || [];
    document.getElementById('totalFiles').textContent = files.length;

    const totalBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);
    document.getElementById('totalSize').textContent = formatSize(totalBytes);
  } catch (e) {
    console.error('Stats load error:', e);
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('.theme-option').forEach((o) => o.classList.toggle('active', o.dataset.theme === theme));
}

function updateWebdavInfo() {
  const el = document.getElementById('webdavInfo');
  if (el) {
    el.textContent = `服务器地址：${window.location.origin}/api/webdav/
用户名：您的管理员用户名
密码：您的管理员密码`;
  }
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return bytes.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

async function logout() {
  await fetch('/api/auth/logout', { credentials: 'include', headers: getAuthHeaders() });
  localStorage.clear();
  window.location.href = '/login.html';
}
