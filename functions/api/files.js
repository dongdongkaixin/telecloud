// functions/api/files.js
// 文件列表、单文件信息、批量操作

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const folderId = url.searchParams.get("folderId") || "root";
  const fileId = url.searchParams.get("id");

  if (fileId) {
    // 获取单文件详情
    const raw = await env.TC_KV.get(`file:${fileId}`);
    if (!raw) return errorResponse("File not found", 404);
    return jsonResponse(JSON.parse(raw));
  }

  // 列出文件夹内所有文件
  const idxKey = `folder_files:${folderId}`;
  const idxRaw = await env.TC_KV.get(idxKey);
  const fileIds = idxRaw ? JSON.parse(idxRaw) : [];

  const files = [];
  for (const id of fileIds) {
    const raw = await env.TC_KV.get(`file:${id}`);
    if (raw) files.push(JSON.parse(raw));
  }

  return jsonResponse({ folderId, files });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.pathname === "/api/files/batch-delete") {
    return handleBatchDelete(request, env);
  }

  const fileId = url.searchParams.get("id");
  if (!fileId) return errorResponse("Missing file id", 400);

  return deleteFile(fileId, env);
}

async function deleteFile(fileId, env) {
  const raw = await env.TC_KV.get(`file:${fileId}`);
  if (!raw) return errorResponse("File not found", 404);
  const file = JSON.parse(raw);

  // 删除 KV 文件记录
  await env.TC_KV.delete(`file:${fileId}`);

  // 从文件夹索引移除
  const idxKey = `folder_files:${file.folderId}`;
  const idxRaw = await env.TC_KV.get(idxKey);
  if (idxRaw) {
    const ids = JSON.parse(idxRaw).filter((id) => id !== fileId);
    await env.TC_KV.put(idxKey, JSON.stringify(ids));
  }

  // 注意：Telegram 消息无法通过 Bot API 删除 channel 中的文件，
  // 但文件记录已从系统中移除，无法再访问。

  return jsonResponse({ ok: true, deleted: fileId });
}

async function handleBatchDelete(request, env) {
  try {
    const body = await request.json();
    const { fileIds } = body;
    if (!Array.isArray(fileIds)) return errorResponse("Invalid input", 400);

    const results = [];
    for (const id of fileIds) {
      try {
        await deleteFile(id, env);
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, error: e.message });
      }
    }
    return jsonResponse({ ok: true, results });
  } catch (e) {
    return errorResponse(e.message);
  }
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
