// functions/api/move.js
// 单文件 / 批量文件移动到指定文件夹

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const body = await request.json();

  if (url.pathname === "/api/move/batch") {
    return handleBatchMove(body, env);
  }

  // 单文件移动
  const { fileId, targetFolderId } = body;
  if (!fileId || !targetFolderId) return errorResponse("Missing fields", 400);
  return moveFile(fileId, targetFolderId, env);
}

async function moveFile(fileId, targetFolderId, env) {
  const raw = await env.TC_KV.get(`file:${fileId}`);
  if (!raw) return errorResponse("File not found", 404);
  const file = JSON.parse(raw);

  const oldFolderId = file.folderId;
  if (oldFolderId === targetFolderId) {
    return jsonResponse({ ok: true, message: "Already in target folder" });
  }

  // 从旧文件夹索引移除
  const oldIdxRaw = await env.TC_KV.get(`folder_files:${oldFolderId}`);
  if (oldIdxRaw) {
    const oldIds = JSON.parse(oldIdxRaw).filter((id) => id !== fileId);
    await env.TC_KV.put(`folder_files:${oldFolderId}`, JSON.stringify(oldIds));
  }

  // 添加到新文件夹索引
  const newIdxRaw = await env.TC_KV.get(`folder_files:${targetFolderId}`);
  const newIds = newIdxRaw ? JSON.parse(newIdxRaw) : [];
  if (!newIds.includes(fileId)) newIds.push(fileId);
  await env.TC_KV.put(`folder_files:${targetFolderId}`, JSON.stringify(newIds));

  // 更新文件记录
  file.folderId = targetFolderId;
  file.updatedAt = Date.now();
  await env.TC_KV.put(`file:${fileId}`, JSON.stringify(file));

  return jsonResponse({ ok: true, file });
}

async function handleBatchMove(body, env) {
  const { fileIds, targetFolderId } = body;
  if (!Array.isArray(fileIds) || !targetFolderId) {
    return errorResponse("Invalid input", 400);
  }

  const results = [];
  for (const id of fileIds) {
    try {
      await moveFile(id, targetFolderId, env);
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: e.message });
    }
  }
  return jsonResponse({ ok: true, results });
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
