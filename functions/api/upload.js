// functions/api/upload.js
// 分块上传到 Telegram Bot API，突破 2GB 限制
// 每块最大 19MB（Telegram 限制 20MB per document）
// 元数据存入 KV

const CHUNK_SIZE = 19 * 1024 * 1024; // 19MB per chunk

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.pathname === "/api/upload/chunk") {
    return handleChunkUpload(request, env);
  }
  if (url.pathname === "/api/upload/complete") {
    return handleCompleteUpload(request, env);
  }
  if (url.pathname === "/api/upload/init") {
    return handleInitUpload(request, env);
  }

  return new Response("Not found", { status: 404 });
}

// 初始化上传：生成 uploadId
async function handleInitUpload(request, env) {
  try {
    const body = await request.json();
    const { filename, filesize, mimetype, folderId = "root" } = body;

    const uploadId = generateId();
    const totalChunks = Math.ceil(filesize / CHUNK_SIZE);

    const uploadMeta = {
      uploadId,
      filename,
      filesize,
      mimetype,
      folderId,
      totalChunks,
      receivedChunks: [],
      telegramFileIds: [],
      createdAt: Date.now(),
    };

    await env.TC_KV.put(
      `upload:${uploadId}`,
      JSON.stringify(uploadMeta),
      { expirationTtl: 24 * 60 * 60 } // 24h TTL for incomplete uploads
    );

    return jsonResponse({ uploadId, totalChunks, chunkSize: CHUNK_SIZE });
  } catch (e) {
    return errorResponse(e.message);
  }
}

// 上传单个分块到 Telegram
async function handleChunkUpload(request, env) {
  try {
    const formData = await request.formData();
    const uploadId = formData.get("uploadId");
    const chunkIndex = parseInt(formData.get("chunkIndex"));
    const chunkBlob = formData.get("chunk");

    if (!uploadId || isNaN(chunkIndex) || !chunkBlob) {
      return errorResponse("Missing required fields", 400);
    }

    const metaRaw = await env.TC_KV.get(`upload:${uploadId}`);
    if (!metaRaw) return errorResponse("Upload session not found", 404);
    const meta = JSON.parse(metaRaw);

    // 将分块上传到 Telegram
    const tgResult = await uploadChunkToTelegram(
      chunkBlob,
      `${meta.filename}.part${chunkIndex}`,
      env
    );

    if (!tgResult.ok) {
      return errorResponse(`Telegram upload failed: ${tgResult.description}`, 502);
    }

    const fileId = tgResult.result.document.file_id;
    meta.telegramFileIds[chunkIndex] = fileId;
    meta.receivedChunks.push(chunkIndex);

    await env.TC_KV.put(`upload:${uploadId}`, JSON.stringify(meta), {
      expirationTtl: 24 * 60 * 60,
    });

    return jsonResponse({
      ok: true,
      chunkIndex,
      fileId,
      progress: `${meta.receivedChunks.length}/${meta.totalChunks}`,
    });
  } catch (e) {
    return errorResponse(e.message);
  }
}

// 完成上传：注册文件元数据到 KV 文件系统
async function handleCompleteUpload(request, env) {
  try {
    const body = await request.json();
    const { uploadId } = body;

    const metaRaw = await env.TC_KV.get(`upload:${uploadId}`);
    if (!metaRaw) return errorResponse("Upload session not found", 404);
    const meta = JSON.parse(metaRaw);

    if (meta.receivedChunks.length !== meta.totalChunks) {
      return errorResponse(
        `Incomplete: ${meta.receivedChunks.length}/${meta.totalChunks} chunks received`,
        400
      );
    }

    const fileId = generateId();
    const fileRecord = {
      id: fileId,
      name: meta.filename,
      size: meta.filesize,
      mimetype: meta.mimetype,
      folderId: meta.folderId,
      chunks: meta.telegramFileIds,
      totalChunks: meta.totalChunks,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // 存储文件记录
    await env.TC_KV.put(`file:${fileId}`, JSON.stringify(fileRecord));

    // 更新文件夹索引
    await addFileToFolder(fileRecord.folderId, fileId, env);

    // 清理上传会话
    await env.TC_KV.delete(`upload:${uploadId}`);

    return jsonResponse({ ok: true, fileId, file: fileRecord });
  } catch (e) {
    return errorResponse(e.message);
  }
}

async function uploadChunkToTelegram(blob, filename, env) {
  const tgFormData = new FormData();
  tgFormData.append("chat_id", env.TG_CHANNEL_ID);
  tgFormData.append("document", blob, filename);

  const res = await fetch(
    `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendDocument`,
    {
      method: "POST",
      body: tgFormData,
    }
  );
  return res.json();
}

async function addFileToFolder(folderId, fileId, env) {
  const idxKey = `folder_files:${folderId}`;
  const existingRaw = await env.TC_KV.get(idxKey);
  const existing = existingRaw ? JSON.parse(existingRaw) : [];
  if (!existing.includes(fileId)) {
    existing.push(fileId);
  }
  await env.TC_KV.put(idxKey, JSON.stringify(existing));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
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
