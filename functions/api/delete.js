// functions/api/delete.js
// 独立的删除模块，处理以下路由：
//   DELETE /api/delete?id=xxx          → 删除单个文件
//   POST   /api/delete                 → 删除单个文件（body: { fileId }）
//   POST   /api/delete/batch           → 批量删除文件（body: { fileIds: [] }）
//   POST   /api/delete/folder          → 删除文件夹（body: { folderId }）
//   POST   /api/delete/folder-cascade  → 级联删除文件夹及其内所有文件（body: { folderId }）

// ─────────────────────────────────────────────
// GET / DELETE 请求入口
// ─────────────────────────────────────────────
export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const fileId = url.searchParams.get("id");

  if (!fileId) {
    return errorResponse("缺少文件 ID 参数 ?id=xxx", 400);
  }

  return await deleteSingleFile(fileId, env);
}

// ─────────────────────────────────────────────
// POST 请求入口（支持多种子路由）
// ─────────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return errorResponse("请求体 JSON 解析失败", 400);
  }

  // 路由分发
  if (pathname === "/api/delete/batch") {
    return await handleBatchDelete(body, env);
  }

  if (pathname === "/api/delete/folder") {
    return await handleDeleteFolder(body, env);
  }

  if (pathname === "/api/delete/folder-cascade") {
    return await handleDeleteFolderCascade(body, env);
  }

  // POST /api/delete  →  删除单个文件
  const { fileId } = body;
  if (!fileId) {
    return errorResponse("缺少 fileId 字段", 400);
  }
  return await deleteSingleFile(fileId, env);
}

// ─────────────────────────────────────────────
// 核心：删除单个文件
// ─────────────────────────────────────────────
async function deleteSingleFile(fileId, env) {
  // 1. 读取文件记录
  const raw = await env.TC_KV.get(`file:${fileId}`);
  if (!raw) {
    return errorResponse("文件不存在或已被删除", 404);
  }

  const file = JSON.parse(raw);

  // 2. 从所属文件夹的索引中移除该文件 ID
  await removeFileFromFolderIndex(file.folderId, fileId, env);

  // 3. 删除 KV 中的文件记录
  await env.TC_KV.delete(`file:${fileId}`);

  // 4. 尝试删除 Telegram 频道中的消息（仅作记录，Bot API 对频道消息删除有限制）
  //    Telegram Bot API 无法通过 file_id 直接删除已发送的 document，
  //    实际上只能通过 message_id 调用 deleteMessage。
  //    由于存储时未记录 message_id，此处跳过，文件在系统层面已不可访问。
  //    如需彻底清理 Telegram 频道消息，可在管理后台手动操作。

  return jsonResponse({
    ok: true,
    deleted: fileId,
    filename: file.name,
    message: "文件已从存储索引中删除",
  });
}

// ─────────────────────────────────────────────
// 批量删除文件
// ─────────────────────────────────────────────
async function handleBatchDelete(body, env) {
  const { fileIds } = body;

  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return errorResponse("fileIds 必须是非空数组", 400);
  }

  // 限制单次批量删除数量，防止超时
  if (fileIds.length > 200) {
    return errorResponse("单次批量删除不能超过 200 个文件", 400);
  }

  const results = {
    success: [],
    failed: [],
  };

  for (const fileId of fileIds) {
    try {
      const raw = await env.TC_KV.get(`file:${fileId}`);
      if (!raw) {
        results.failed.push({ id: fileId, reason: "文件不存在" });
        continue;
      }

      const file = JSON.parse(raw);
      await removeFileFromFolderIndex(file.folderId, fileId, env);
      await env.TC_KV.delete(`file:${fileId}`);
      results.success.push({ id: fileId, name: file.name });
    } catch (e) {
      results.failed.push({ id: fileId, reason: e.message });
    }
  }

  return jsonResponse({
    ok: true,
    total: fileIds.length,
    successCount: results.success.length,
    failedCount: results.failed.length,
    results,
  });
}

// ─────────────────────────────────────────────
// 删除文件夹（要求文件夹为空）
// ─────────────────────────────────────────────
async function handleDeleteFolder(body, env) {
  const { folderId } = body;

  if (!folderId) {
    return errorResponse("缺少 folderId 字段", 400);
  }

  if (folderId === "root") {
    return errorResponse("根目录不允许删除", 403);
  }

  // 检查文件夹是否存在于索引中
  const foldersRaw = await env.TC_KV.get("folders:index");
  const folders = foldersRaw ? JSON.parse(foldersRaw) : [];
  const targetFolder = folders.find((f) => f.id === folderId);

  if (!targetFolder) {
    return errorResponse("文件夹不存在", 404);
  }

  // 检查文件夹是否为空
  const filesIdxRaw = await env.TC_KV.get(`folder_files:${folderId}`);
  const fileIds = filesIdxRaw ? JSON.parse(filesIdxRaw) : [];

  if (fileIds.length > 0) {
    return errorResponse(
      `文件夹非空，包含 ${fileIds.length} 个文件。请先移动或删除文件夹内的文件，或使用"级联删除"接口。`,
      400
    );
  }

  // 检查是否有子文件夹
  const subFolders = folders.filter((f) => f.parentId === folderId);
  if (subFolders.length > 0) {
    return errorResponse(
      `文件夹包含 ${subFolders.length} 个子文件夹，请先删除子文件夹，或使用"级联删除"接口。`,
      400
    );
  }

  // 从文件夹索引中移除
  const updatedFolders = folders.filter((f) => f.id !== folderId);
  await env.TC_KV.put("folders:index", JSON.stringify(updatedFolders));

  // 清理文件夹的空索引键（如果存在）
  await env.TC_KV.delete(`folder_files:${folderId}`);

  return jsonResponse({
    ok: true,
    deleted: folderId,
    folderName: targetFolder.name,
    message: "文件夹已删除",
  });
}

// ─────────────────────────────────────────────
// 级联删除文件夹（同时删除其内所有文件和子文件夹）
// ─────────────────────────────────────────────
async function handleDeleteFolderCascade(body, env) {
  const { folderId } = body;

  if (!folderId) {
    return errorResponse("缺少 folderId 字段", 400);
  }

  if (folderId === "root") {
    return errorResponse("根目录不允许级联删除", 403);
  }

  const foldersRaw = await env.TC_KV.get("folders:index");
  const allFolders = foldersRaw ? JSON.parse(foldersRaw) : [];

  const targetFolder = allFolders.find((f) => f.id === folderId);
  if (!targetFolder) {
    return errorResponse("文件夹不存在", 404);
  }

  // 递归收集所有需要删除的文件夹 ID（包括自身）
  const folderIdsToDelete = collectFolderTree(folderId, allFolders);

  let deletedFiles = 0;
  let deletedFolders = folderIdsToDelete.length;

  // 逐一删除每个文件夹内的所有文件
  for (const fid of folderIdsToDelete) {
    const filesIdxRaw = await env.TC_KV.get(`folder_files:${fid}`);
    const fileIds = filesIdxRaw ? JSON.parse(filesIdxRaw) : [];

    for (const fileId of fileIds) {
      await env.TC_KV.delete(`file:${fileId}`);
      deletedFiles++;
    }

    // 删除文件夹的文件索引键
    await env.TC_KV.delete(`folder_files:${fid}`);
  }

  // 从文件夹总索引中移除这些文件夹
  const remainingFolders = allFolders.filter(
    (f) => !folderIdsToDelete.includes(f.id)
  );
  await env.TC_KV.put("folders:index", JSON.stringify(remainingFolders));

  return jsonResponse({
    ok: true,
    deletedFolderRoot: folderId,
    folderName: targetFolder.name,
    deletedFolders,
    deletedFiles,
    message: `已级联删除文件夹"${targetFolder.name}"及其内 ${deletedFiles} 个文件、${deletedFolders} 个文件夹`,
  });
}

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────

/**
 * 递归收集某文件夹及其所有子文件夹的 ID
 * @param {string} rootId  起始文件夹 ID
 * @param {Array}  folders 全部文件夹列表
 * @returns {string[]}     需要删除的所有文件夹 ID 数组
 */
function collectFolderTree(rootId, folders) {
  const result = [rootId];
  const children = folders.filter((f) => f.parentId === rootId);
  for (const child of children) {
    result.push(...collectFolderTree(child.id, folders));
  }
  return result;
}

/**
 * 从文件夹的文件索引中移除指定文件 ID
 */
async function removeFileFromFolderIndex(folderId, fileId, env) {
  if (!folderId) return;
  const idxKey = `folder_files:${folderId}`;
  const idxRaw = await env.TC_KV.get(idxKey);
  if (!idxRaw) return;

  const ids = JSON.parse(idxRaw).filter((id) => id !== fileId);
  await env.TC_KV.put(idxKey, JSON.stringify(ids));
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(msg, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
