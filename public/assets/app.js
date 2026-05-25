// public/assets/app.js
// 主文件管理页面完整交互逻辑

// ─────────────────────────────────────────────
// API 请求封装
// ─────────────────────────────────────────────
const API = {
  get: (url) =>
    fetch(url, {
      credentials: "include",
      headers: getAuthHeaders(),
    }),

  post: (url, data) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(data),
      credentials: "include",
    }),

  delete: (url) =>
    fetch(url, {
      method: "DELETE",
      credentials: "include",
      headers: getAuthHeaders(),
    }),
};

function getAuthHeaders() {
  const token = localStorage.getItem("tc_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─────────────────────────────────────────────
// 全局状态
// ─────────────────────────────────────────────
let currentFolderId   = "root";
let currentFolderName = "根目录";
let folders           = [];
let selectedFiles     = new Set();
let moveTargetFolderId = null;
let moveFileIds        = [];

// ─────────────────────────────────────────────
// 初始化
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // 检查登录状态
  const res = await fetch("/api/auth/check", {
    credentials: "include",
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    window.location.href = "/login.html";
    return;
  }

  // 管理员才显示后台入口
  const role = localStorage.getItem("tc_role");
  if (role === "admin") {
    const adminBtn = document.getElementById("adminBtn");
    if (adminBtn) adminBtn.style.display = "block";
  }

  await loadFolders();
  await loadFiles(currentFolderId);
  setupDragAndDrop();
  applyTheme();
});

// 应用主题
function applyTheme() {
  const settings = JSON.parse(localStorage.getItem("tc_settings") || "{}");
  if (settings.theme) {
    document.documentElement.setAttribute("data-theme", settings.theme);
  }
  if (settings.bgImageUrl) {
    document.body.style.backgroundImage = `url(${settings.bgImageUrl})`;
    document.body.style.backgroundSize  = "cover";
  }
}

// ─────────────────────────────────────────────
// 文件夹管理
// ─────────────────────────────────────────────

// 加载并渲染所有文件夹
async function loadFolders() {
  try {
    const res = await API.get("/api/folders");
    if (!res.ok) throw new Error("获取文件夹失败");
    const data = await res.json();
    folders = data.folders || [];
    renderFolderList();
  } catch (e) {
    showToast("文件夹加载失败：" + e.message, "error");
  }
}

function renderFolderList() {
  const list = document.getElementById("folderList");
  if (!list) return;

  list.innerHTML = "";
  folders.forEach((folder) => {
    const item = document.createElement("div");
    item.className = `folder-item ${folder.id === currentFolderId ? "active" : ""}`;
    item.dataset.id = folder.id;
    item.innerHTML = `<span class="folder-icon">📁</span><span>${escapeHtml(folder.name)}</span>`;
    item.onclick = () => switchFolder(folder.id, folder.name);

    // 右键菜单（根目录不允许）
    if (folder.id !== "root") {
      item.oncontextmenu = (e) => {
        e.preventDefault();
        showFolderContextMenu(folder, e);
      };
    }

    list.appendChild(item);
  });
}

// 切换文件夹
async function switchFolder(folderId, folderName) {
  currentFolderId   = folderId;
  currentFolderName = folderName;
  selectedFiles.clear();
  updateBatchButtons();

  const titleEl = document.getElementById("currentFolderName");
  if (titleEl) titleEl.textContent = folderName;

  document.querySelectorAll(".folder-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === folderId);
  });

  await loadFiles(folderId);
}

// 显示新建文件夹弹窗
function showNewFolderModal() {
  const input = document.getElementById("newFolderName");
  if (input) input.value = "";
  openModal("newFolderModal");
}

// 创建文件夹
async function createFolder() {
  const nameInput = document.getElementById("newFolderName");
  const name = nameInput ? nameInput.value.trim() : "";

  if (!name) {
    showToast("请输入文件夹名称", "error");
    return;
  }

  try {
    const res = await API.post("/api/folders/create", {
      name,
      parentId: currentFolderId,
    });

    if (res.ok) {
      closeModal("newFolderModal");
      showToast(`文件夹"${name}"创建成功`, "success");
      await loadFolders();
    } else {
      const err = await res.json();
      showToast(err.error || "创建失败", "error");
    }
  } catch (e) {
    showToast("创建失败：" + e.message, "error");
  }
}

// 删除文件夹（空文件夹）
async function deleteFolder(folderId) {
  if (!confirm("确定删除此文件夹？文件夹必须为空才能删除。")) return;

  try {
    const res = await API.post("/api/delete/folder", { folderId });

    if (res.ok) {
      const data = await res.json();
      showToast(data.message || "文件夹已删除", "success");

      if (currentFolderId === folderId) {
        await switchFolder("root", "根目录");
      }
      await loadFolders();
    } else {
      const err = await res.json();

      // 文件夹非空时，询问是否级联删除
      if (err.error && (err.error.includes("非空") || err.error.includes("子文件夹"))) {
        if (confirm(`${err.error}\n\n是否连同文件夹内所有文件和子文件夹一起删除？\n⚠️ 此操作不可撤销！`)) {
          await deleteFolderCascade(folderId);
        }
      } else {
        showToast(err.error || "删除失败", "error");
      }
    }
  } catch (e) {
    showToast("删除失败：" + e.message, "error");
  }
}

// 级联删除文件夹（包含其内所有文件和子文件夹）
async function deleteFolderCascade(folderId) {
  try {
    const res = await API.post("/api/delete/folder-cascade", { folderId });

    if (res.ok) {
      const data = await res.json();
      showToast(data.message || "级联删除完成", "success");

      if (currentFolderId === folderId) {
        await switchFolder("root", "根目录");
      }
      await loadFolders();
      await loadFiles(currentFolderId);
    } else {
      const err = await res.json();
      showToast(err.error || "级联删除失败", "error");
    }
  } catch (e) {
    showToast("级联删除失败：" + e.message, "error");
  }
}

// 重命名文件夹
async function renameFolderPrompt(folderId, currentName) {
  const newName = prompt("输入新名称：", currentName);
  if (!newName || newName.trim() === currentName) return;

  try {
    const res = await API.post("/api/folders/rename", {
      folderId,
      newName: newName.trim(),
    });

    if (res.ok) {
      if (currentFolderId === folderId) {
        currentFolderName = newName.trim();
        const titleEl = document.getElementById("currentFolderName");
        if (titleEl) titleEl.textContent = newName.trim();
      }
      showToast("重命名成功", "success");
      await loadFolders();
    } else {
      const err = await res.json();
      showToast(err.error || "重命名失败", "error");
    }
  } catch (e) {
    showToast("重命名失败：" + e.message, "error");
  }
}

// 文件夹右键菜单
function showFolderContextMenu(folder, event) {
  // 移除已有的右键菜单
  const existing = document.getElementById("folderContextMenu");
  if (existing) existing.remove();

  const menu = document.createElement("div");
  menu.id = "folderContextMenu";
  menu.style.cssText = `
    position: fixed;
    top: ${event.clientY}px;
    left: ${event.clientX}px;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px;
    z-index: 500;
    min-width: 160px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  `;

  const menuItems = [
    {
      icon: "✏️",
      label: "重命名",
      action: () => renameFolderPrompt(folder.id, folder.name),
    },
    {
      icon: "🗑️",
      label: "删除文件夹",
      action: () => deleteFolder(folder.id),
      danger: true,
    },
    {
      icon: "💣",
      label: "级联删除（含文件）",
      action: () => {
        if (confirm(`⚠️ 将删除"${folder.name}"及其内所有文件！此操作不可撤销，确定吗？`)) {
          deleteFolderCascade(folder.id);
        }
      },
      danger: true,
    },
  ];

  menuItems.forEach(({ icon, label, action, danger }) => {
    const item = document.createElement("div");
    item.style.cssText = `
      padding: 9px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 8px;
      color: ${danger ? "var(--danger)" : "var(--text)"};
      transition: background 0.15s;
    `;
    item.innerHTML = `${icon} ${label}`;
    item.addEventListener("mouseenter", () => {
      item.style.background = "var(--hover-bg)";
    });
    item.addEventListener("mouseleave", () => {
      item.style.background = "transparent";
    });
    item.addEventListener("click", () => {
      menu.remove();
      action();
    });
    menu.appendChild(item);
  });

  document.body.appendChild(menu);

  // 点击其他区域关闭菜单
  setTimeout(() => {
    document.addEventListener("click", () => menu.remove(), { once: true });
  }, 50);
}

// ─────────────────────────────────────────────
// 文件列表
// ─────────────────────────────────────────────

async function loadFiles(folderId) {
  const tbody = document.getElementById("fileList");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr class="loading-row">
      <td colspan="5" style="text-align:center;padding:48px;color:var(--text-muted)">
        ⏳ 加载中...
      </td>
    </tr>
  `;

  try {
    const res = await API.get(`/api/files?folderId=${folderId}`);
    if (!res.ok) throw new Error("获取文件列表失败");
    const data = await res.json();
    renderFileList(data.files || []);
  } catch (e) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;padding:48px;color:var(--danger)">
          ❌ 加载失败：${escapeHtml(e.message)}
        </td>
      </tr>
    `;
  }
}

function renderFileList(files) {
  const tbody = document.getElementById("fileList");
  if (!tbody) return;

  if (files.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;padding:48px;color:var(--text-muted)">
          📭 此文件夹为空，赶紧上传文件吧
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = files
    .map(
      (file) => `
      <tr data-id="${escapeHtml(file.id)}">
        <td>
          <input
            type="checkbox"
            class="file-checkbox"
            value="${escapeHtml(file.id)}"
            onchange="toggleSelect('${escapeHtml(file.id)}', this.checked)"
          />
        </td>
        <td>
          <div class="file-name">
            <span>${getFileIcon(file.mimetype)}</span>
            <span title="${escapeHtml(file.name)}">${escapeHtml(truncateFilename(file.name, 40))}</span>
          </div>
        </td>
        <td style="white-space:nowrap">${formatSize(file.size)}</td>
        <td style="white-space:nowrap">${formatDate(file.createdAt)}</td>
        <td>
          <div class="file-actions">
            <button
              class="btn-file-action"
              onclick="downloadFile('${escapeHtml(file.id)}', '${escapeHtml(file.name)}')"
              title="下载"
            >⬇️ 下载</button>
            <button
              class="btn-file-action"
              onclick="showMoveModal(['${escapeHtml(file.id)}'])"
              title="移动到其他文件夹"
            >📦 移动</button>
            <button
              class="btn-file-action danger"
              onclick="deleteSingleFile('${escapeHtml(file.id)}', '${escapeHtml(file.name)}')"
              title="删除"
            >🗑️ 删除</button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");
}

// 获取文件图标
function getFileIcon(mimetype) {
  if (!mimetype) return "📄";
  if (mimetype.startsWith("image/"))  return "🖼️";
  if (mimetype.startsWith("video/"))  return "🎬";
  if (mimetype.startsWith("audio/"))  return "🎵";
  if (mimetype.startsWith("text/"))   return "📝";
  if (mimetype.includes("zip") || mimetype.includes("rar") || mimetype.includes("7z") || mimetype.includes("tar")) return "📦";
  if (mimetype.includes("pdf"))       return "📕";
  if (mimetype.includes("torrent"))   return "🧲";
  if (mimetype.includes("word") || mimetype.includes("document")) return "📄";
  if (mimetype.includes("sheet") || mimetype.includes("excel"))   return "📊";
  if (mimetype.includes("presentation") || mimetype.includes("powerpoint")) return "📊";
  if (mimetype.includes("json") || mimetype.includes("xml"))      return "🗒️";
  return "📄";
}

// ─────────────────────────────────────────────
// 批量选择
// ─────────────────────────────────────────────

function toggleSelect(fileId, checked) {
  if (checked) selectedFiles.add(fileId);
  else selectedFiles.delete(fileId);
  updateBatchButtons();
}

function toggleSelectAll(checkbox) {
  document.querySelectorAll(".file-checkbox").forEach((cb) => {
    cb.checked = checkbox.checked;
    if (checkbox.checked) selectedFiles.add(cb.value);
    else selectedFiles.delete(cb.value);
  });
  updateBatchButtons();
}

function updateBatchButtons() {
  const hasSel = selectedFiles.size > 0;
  const batchDeleteBtn = document.getElementById("batchDeleteBtn");
  const batchMoveBtn   = document.getElementById("batchMoveBtn");

  if (batchDeleteBtn) {
    batchDeleteBtn.style.display = hasSel ? "inline-flex" : "none";
    batchDeleteBtn.textContent   = hasSel ? `🗑️ 删除(${selectedFiles.size})` : "";
  }
  if (batchMoveBtn) {
    batchMoveBtn.style.display = hasSel ? "inline-flex" : "none";
    batchMoveBtn.textContent   = hasSel ? `📦 移动(${selectedFiles.size})` : "";
  }
}

// ─────────────────────────────────────────────
// 删除操作
// ─────────────────────────────────────────────

// 删除单个文件
async function deleteSingleFile(fileId, filename) {
  const displayName = filename || fileId;
  if (!confirm(`确定删除文件"${displayName}"？\n此操作不可撤销。`)) return;

  try {
    const res = await fetch(`/api/delete?id=${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
      credentials: "include",
    });

    if (res.ok) {
      const data = await res.json();
      showToast(data.message || `文件"${displayName}"已删除`, "success");
      // 如果该文件在选中集合里，移除它
      selectedFiles.delete(fileId);
      updateBatchButtons();
      await loadFiles(currentFolderId);
    } else {
      const err = await res.json();
      showToast(err.error || "删除失败", "error");
    }
  } catch (e) {
    showToast("删除失败：" + e.message, "error");
  }
}

// 批量删除文件
async function batchDelete() {
  if (selectedFiles.size === 0) return;

  if (!confirm(`确定删除选中的 ${selectedFiles.size} 个文件？\n此操作不可撤销。`)) return;

  try {
    const res = await API.post("/api/delete/batch", {
      fileIds: [...selectedFiles],
    });

    if (res.ok) {
      const data = await res.json();
      const msg = `成功删除 ${data.successCount} 个文件${
        data.failedCount > 0 ? `，${data.failedCount} 个失败` : ""
      }`;
      showToast(msg, data.failedCount > 0 ? "warning" : "success");

      selectedFiles.clear();
      updateBatchButtons();

      // 取消全选状态
      const selectAllCb = document.getElementById("selectAll");
      if (selectAllCb) selectAllCb.checked = false;

      await loadFiles(currentFolderId);
    } else {
      const err = await res.json();
      showToast(err.error || "批量删除失败", "error");
    }
  } catch (e) {
    showToast("批量删除失败：" + e.message, "error");
  }
}

// ─────────────────────────────────────────────
// 下载文件
// ─────────────────────────────────────────────

function downloadFile(fileId, filename) {
  const a = document.createElement("a");
  a.href     = `/api/download?id=${encodeURIComponent(fileId)}`;
  a.download = filename || fileId;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast(`开始下载"${filename}"`, "success");
}

// ─────────────────────────────────────────────
// 移动文件
// ─────────────────────────────────────────────

function showMoveModal(fileIds) {
  moveFileIds       = fileIds;
  moveTargetFolderId = null;

  const list = document.getElementById("moveFolderList");
  if (!list) return;

  // 过滤掉当前文件夹（移动到当前位置没意义）
  const movableFolders = folders.filter((f) => f.id !== currentFolderId);

  if (movableFolders.length === 0) {
    showToast("没有其他可移动的目标文件夹", "error");
    return;
  }

  list.innerHTML = movableFolders
    .map(
      (f) => `
      <div
        class="folder-select-item"
        data-id="${escapeHtml(f.id)}"
        onclick="selectMoveTarget('${escapeHtml(f.id)}', this)"
      >
        📁 ${escapeHtml(f.name)}
      </div>
    `
    )
    .join("");

  openModal("moveModal");
}

function selectMoveTarget(folderId, el) {
  moveTargetFolderId = folderId;
  document.querySelectorAll(".folder-select-item").forEach((e) =>
    e.classList.remove("selected")
  );
  el.classList.add("selected");
}

function showBatchMoveModal() {
  if (selectedFiles.size === 0) return;
  showMoveModal([...selectedFiles]);
}

async function confirmMove() {
  if (!moveTargetFolderId) {
    showToast("请先选择目标文件夹", "error");
    return;
  }
  if (moveFileIds.length === 0) {
    showToast("没有需要移动的文件", "error");
    return;
  }

  try {
    let res;

    if (moveFileIds.length === 1) {
      // 单文件移动
      res = await API.post("/api/move", {
        fileId: moveFileIds[0],
        targetFolderId: moveTargetFolderId,
      });
    } else {
      // 批量移动
      res = await API.post("/api/move/batch", {
        fileIds: moveFileIds,
        targetFolderId: moveTargetFolderId,
      });
    }

    if (res.ok) {
      const data = await res.json();
      const targetFolder = folders.find((f) => f.id === moveTargetFolderId);
      showToast(
        `已成功移动到"${targetFolder ? targetFolder.name : "目标文件夹"}"`,
        "success"
      );
      closeModal("moveModal");
      selectedFiles.clear();
      updateBatchButtons();

      const selectAllCb = document.getElementById("selectAll");
      if (selectAllCb) selectAllCb.checked = false;

      await loadFiles(currentFolderId);
    } else {
      const err = await res.json();
      showToast(err.error || "移动失败", "error");
    }
  } catch (e) {
    showToast("移动失败：" + e.message, "error");
  }
}

// ─────────────────────────────────────────────
// 文件上传（本地分块上传）
// ─────────────────────────────────────────────

const CHUNK_SIZE = 19 * 1024 * 1024; // 19MB per chunk

function showUploadModal() {
  openModal("uploadModal");
}

function handleFileSelect(input) {
  const files = Array.from(input.files);
  if (files.length === 0) return;
  files.forEach((file) => uploadFile(file));
  input.value = ""; // 允许重复选择同一文件
}

// 拖拽上传
function setupDragAndDrop() {
  const dropZone = document.getElementById("dropZone");
  if (!dropZone) return;

  ["dragenter", "dragover"].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("dragover");
    });
  });

  ["dragleave", "dragend"].forEach((evt) => {
    dropZone.addEventListener(evt, () => {
      dropZone.classList.remove("dragover");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("dragover");
    const files = Array.from(e.dataTransfer.files);
    files.forEach((file) => uploadFile(file));
  });
}

// 上传单个文件（自动分块）
async function uploadFile(file) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;

  // 显示进度区域
  const progressEl    = document.getElementById("uploadProgress");
  const progressFill  = document.getElementById("progressFill");
  const progressTitle = document.getElementById("progressTitle");
  const progressPct   = document.getElementById("progressPct");
  const progressDetail= document.getElementById("progressDetail");

  if (progressEl) progressEl.style.display = "block";
  if (progressTitle) progressTitle.textContent = `上传：${truncateFilename(file.name, 30)}`;
  if (progressFill)  progressFill.style.width  = "0%";
  if (progressPct)   progressPct.textContent    = "0%";
  if (progressDetail) progressDetail.textContent = `准备上传，共 ${totalChunks} 个分块`;

  try {
    // Step 1: 初始化上传会话
    const initRes = await fetch("/api/upload/init", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        filename  : file.name,
        filesize  : file.size,
        mimetype  : file.type || "application/octet-stream",
        folderId  : currentFolderId,
      }),
      credentials: "include",
    });

    if (!initRes.ok) {
      const err = await initRes.json();
      throw new Error(err.error || "初始化上传失败");
    }

    const { uploadId } = await initRes.json();

    // Step 2: 逐块上传
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end   = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const fd = new FormData();
      fd.append("uploadId",    uploadId);
      fd.append("chunkIndex",  String(i));
      fd.append("chunk",       chunk, `${file.name}.part${i}`);

      const chunkRes = await fetch("/api/upload/chunk", {
        method: "POST",
        headers: getAuthHeaders(),
        body: fd,
        credentials: "include",
      });

      if (!chunkRes.ok) {
        const err = await chunkRes.json();
        throw new Error(err.error || `第 ${i + 1} 块上传失败`);
      }

      // 更新进度（留 5% 给最后完成步骤）
      const pct = Math.round(((i + 1) / totalChunks) * 95);
      if (progressFill)  progressFill.style.width = pct + "%";
      if (progressPct)   progressPct.textContent   = pct + "%";
      if (progressDetail)
        progressDetail.textContent = `分块 ${i + 1} / ${totalChunks} · 已上传 ${formatSize(end)} / ${formatSize(file.size)}`;
    }

    // Step 3: 通知服务器完成上传
    const completeRes = await fetch("/api/upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ uploadId }),
      credentials: "include",
    });

    if (!completeRes.ok) {
      const err = await completeRes.json();
      throw new Error(err.error || "完成上传时出错");
    }

    // 成功
    if (progressFill)  progressFill.style.width = "100%";
    if (progressPct)   progressPct.textContent   = "100%";
    if (progressDetail) progressDetail.textContent = "✅ 上传完成！";

    showToast(`"${file.name}"上传成功`, "success");

    setTimeout(async () => {
      if (progressEl) progressEl.style.display = "none";
      closeModal("uploadModal");
      await loadFiles(currentFolderId);
    }, 1500);
  } catch (e) {
    if (progressDetail) progressDetail.textContent = `❌ 错误：${e.message}`;
    if (progressPct)    progressPct.textContent     = "失败";
    showToast("上传失败：" + e.message, "error");

    setTimeout(() => {
      if (progressEl) progressEl.style.display = "none";
    }, 4000);
  }
}

// ─────────────────────────────────────────────
// 远程上传
// ─────────────────────────────────────────────

function showRemoteUploadModal() {
  // 重置状态
  const statusEl = document.getElementById("remoteUploadStatus");
  if (statusEl) {
    statusEl.style.display = "none";
    statusEl.textContent   = "";
    statusEl.className     = "status-msg";
  }
  switchTab("url");
  openModal("remoteUploadModal");
}

// 切换远程上传 Tab
function switchTab(tabId) {
  // 重置所有 tab 按钮
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  // 隐藏所有 tab 内容
  document.querySelectorAll(".tab-content").forEach((c) => {
    c.style.display = "none";
  });

  // 激活对应的 tab 按钮
  const activeTab = document.querySelector(`.tab[onclick="switchTab('${tabId}')"]`);
  if (activeTab) activeTab.classList.add("active");

  // 显示对应内容
  const activeContent = document.getElementById(`tab-${tabId}`);
  if (activeContent) activeContent.style.display = "block";
}

// URL 远程上传
async function startRemoteUpload() {
  const urlInput      = document.getElementById("remoteUrl");
  const filenameInput = document.getElementById("remoteFilename");
  const statusEl      = document.getElementById("remoteUploadStatus");

  const url      = urlInput      ? urlInput.value.trim()      : "";
  const filename = filenameInput ? filenameInput.value.trim() : "";

  if (!url) {
    showToast("请输入文件链接 URL", "error");
    return;
  }

  if (statusEl) {
    statusEl.className    = "status-msg";
    statusEl.textContent  = "⏳ 正在提交远程上传任务，请稍候...";
    statusEl.style.display = "block";
  }

  try {
    const res = await API.post("/api/remote-upload", {
      url,
      filename  : filename || undefined,
      folderId  : currentFolderId,
    });

    const data = await res.json();

    if (res.ok) {
      if (statusEl) {
        statusEl.className   = "status-msg success";
        statusEl.textContent = "✅ 远程文件上传成功！";
      }
      showToast("远程上传成功", "success");
      setTimeout(async () => {
        closeModal("remoteUploadModal");
        await loadFiles(currentFolderId);
      }, 1500);
    } else {
      if (statusEl) {
        statusEl.className   = "status-msg error";
        statusEl.textContent = `❌ ${data.error || "上传失败"}`;
      }
      showToast(data.error || "远程上传失败", "error");
    }
  } catch (e) {
    if (statusEl) {
      statusEl.className   = "status-msg error";
      statusEl.textContent = `❌ 网络错误：${e.message}`;
    }
    showToast("远程上传失败：" + e.message, "error");
  }
}

// 磁力链接提交
async function startMagnetUpload() {
  const magnetInput = document.getElementById("magnetLink");
  const statusEl    = document.getElementById("remoteUploadStatus");
  const magnet      = magnetInput ? magnetInput.value.trim() : "";

  if (!magnet) {
    showToast("请输入磁力链接", "error");
    return;
  }
  if (!magnet.startsWith("magnet:")) {
    showToast("磁力链接格式错误，应以 magnet: 开头", "error");
    return;
  }

  if (statusEl) {
    statusEl.className    = "status-msg";
    statusEl.textContent  = "⏳ 正在处理磁力链接...";
    statusEl.style.display = "block";
  }

  try {
    const res  = await API.post("/api/torrent/magnet", {
      magnet,
      folderId: currentFolderId,
    });
    const data = await res.json();

    if (statusEl) {
      statusEl.className   = res.ok ? "status-msg success" : "status-msg error";
      statusEl.textContent = data.message || (res.ok ? "✅ 任务已创建" : `❌ ${data.error || "失败"}`);
    }

    if (res.ok) showToast("磁力链接任务已提交", "success");
    else showToast(data.error || "提交失败", "error");
  } catch (e) {
    if (statusEl) {
      statusEl.className   = "status-msg error";
      statusEl.textContent = `❌ 网络错误：${e.message}`;
    }
  }
}

// 种子文件上传
async function startTorrentUpload() {
  const fileInput = document.getElementById("torrentFile");
  const statusEl  = document.getElementById("remoteUploadStatus");

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    showToast("请选择一个 .torrent 文件", "error");
    return;
  }

  if (statusEl) {
    statusEl.className    = "status-msg";
    statusEl.textContent  = "⏳ 正在上传种子文件...";
    statusEl.style.display = "block";
  }

  try {
    const fd = new FormData();
    fd.append("torrent",  fileInput.files[0]);
    fd.append("folderId", currentFolderId);

    const res = await fetch("/api/torrent/upload", {
      method: "POST",
      headers: getAuthHeaders(),
      body: fd,
      credentials: "include",
    });

    const data = await res.json();

    if (res.ok) {
      if (statusEl) {
        statusEl.className   = "status-msg success";
        statusEl.textContent = `✅ ${data.task?.message || "种子文件已保存到私人空间"}`;
      }
      showToast("种子文件上传成功", "success");
      setTimeout(async () => {
        closeModal("remoteUploadModal");
        await loadFiles(currentFolderId);
      }, 2000);
    } else {
      if (statusEl) {
        statusEl.className   = "status-msg error";
        statusEl.textContent = `❌ ${data.error || "上传失败"}`;
      }
      showToast(data.error || "种子上传失败", "error");
    }
  } catch (e) {
    if (statusEl) {
      statusEl.className   = "status-msg error";
      statusEl.textContent = `❌ 网络错误：${e.message}`;
    }
  }
}

// ─────────────────────────────────────────────
// Modal 控制
// ─────────────────────────────────────────────

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "flex";
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}

// ESC 键关闭所有 Modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal").forEach((m) => {
      m.style.display = "none";
    });
  }
});

// ─────────────────────────────────────────────
// 侧边栏切换（移动端）
// ─────────────────────────────────────────────

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.toggle("open");
}

// 点击主内容区关闭移动端侧边栏
document.addEventListener("click", (e) => {
  const sidebar  = document.getElementById("sidebar");
  const hamburger = document.querySelector(".btn-hamburger");
  if (
    sidebar &&
    sidebar.classList.contains("open") &&
    !sidebar.contains(e.target) &&
    e.target !== hamburger
  ) {
    sidebar.classList.remove("open");
  }
});

// ─────────────────────────────────────────────
// 退出登录
// ─────────────────────────────────────────────

async function logout() {
  try {
    await fetch("/api/auth/logout", {
      credentials: "include",
      headers: getAuthHeaders(),
    });
  } finally {
    localStorage.clear();
    window.location.href = "/login.html";
  }
}

// ─────────────────────────────────────────────
// Toast 通知
// ─────────────────────────────────────────────

let toastTimer = null;

function showToast(message, type = "success") {
  let toast = document.getElementById("globalToast");

  // 动态创建 Toast 元素（如果不存在）
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "globalToast";
    toast.style.cssText = `
      position: fixed;
      bottom: 90px;
      right: 24px;
      padding: 12px 20px;
      border-radius: 10px;
      font-size: 0.875rem;
      font-weight: 500;
      z-index: 9999;
      max-width: 360px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      transition: opacity 0.3s, transform 0.3s;
      opacity: 0;
      transform: translateY(10px);
    `;
    document.body.appendChild(toast);
  }

  const colorMap = {
    success : { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.4)", color: "#10b981" },
    error   : { bg: "rgba(239,68,68,0.15)",  border: "rgba(239,68,68,0.4)",  color: "#ef4444" },
    warning : { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)", color: "#f59e0b" },
    info    : { bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.4)", color: "#3b82f6" },
  };

  const { bg, border, color } = colorMap[type] || colorMap.info;
  toast.style.background   = bg;
  toast.style.border       = `1px solid ${border}`;
  toast.style.color        = color;
  toast.textContent        = message;

  // 显示动画
  requestAnimationFrame(() => {
    toast.style.opacity   = "1";
    toast.style.transform = "translateY(0)";
  });

  // 自动隐藏
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.opacity   = "0";
    toast.style.transform = "translateY(10px)";
  }, 3000);
}

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

// HTML 转义，防止 XSS
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

// 格式化文件大小
function formatSize(bytes) {
  if (!bytes || bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return size.toFixed(i > 0 ? 1 : 0) + " " + units[i];
}

// 格式化日期
function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN", {
    year   : "numeric",
    month  : "2-digit",
    day    : "2-digit",
    hour   : "2-digit",
    minute : "2-digit",
  });
}

// 截断过长的文件名
function truncateFilename(name, maxLen = 40) {
  if (!name || name.length <= maxLen) return name || "";
  const ext   = name.includes(".") ? "." + name.split(".").pop() : "";
  const base  = name.slice(0, name.length - ext.length);
  const keep  = maxLen - ext.length - 3;
  return base.slice(0, keep) + "..." + ext;
}
