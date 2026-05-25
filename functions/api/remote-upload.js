// functions/api/remote-upload.js
// 支持通过 URL 链接远程上传文件

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();
  const { url, folderId = "root", filename: customName } = body;

  if (!url) return errorResponse("URL required", 400);

  // 基础 URL 格式验证
  try {
    new URL(url);
  } catch {
    return errorResponse("Invalid URL", 400);
  }

  // 磁力链接交给 torrent handler
  if (url.startsWith("magnet:")) {
    return errorResponse(
      "Use /api/torrent for magnet links",
      400
    );
  }

  try {
    // 流式下载并分块上传到 Telegram
    const uploadId = generateId();
    const headResp = await fetch(url, { method: "HEAD" }).catch(() => null);

    let filename = customName;
    if (!filename) {
      const urlPath = new URL(url).pathname;
      filename = decodeURIComponent(urlPath.split("/").pop()) || `remote_${uploadId}`;
    }

    let mimetype = "application/octet-stream";
    let filesize = 0;

    if (headResp && headResp.ok) {
      mimetype = headResp.headers.get("Content-Type") || mimetype;
      filesize = parseInt(headResp.headers.get("Content-Length") || "0");
    }

    // 初始化上传会话
    const initRes = await fetch(new URL("/api/upload/init", context.request.url).href, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: request.headers.get("Authorization") || "",
        Cookie: request.headers.get("Cookie") || "",
      },
      body: JSON.stringify({ filename, filesize: filesize || 0, mimetype, folderId }),
    });
    const { uploadId: uid } = await initRes.json();

    // 下载并分块上传
    const CHUNK_SIZE = 19 * 1024 * 1024;
    const dlResp = await fetch(url);
    if (!dlResp.ok) return errorResponse(`Failed to fetch remote URL: ${dlResp.status}`, 502);

    const reader = dlResp.body.getReader();
    let buffer = new Uint8Array(0);
    let chunkIndex = 0;
    const telegramFileIds = [];

    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        const newBuf = new Uint8Array(buffer.length + value.length);
        newBuf.set(buffer);
        newBuf.set(value, buffer.length);
        buffer = newBuf;
      }

      while (buffer.length >= CHUNK_SIZE || (done && buffer.length > 0)) {
        const chunk = buffer.slice(0, Math.min(CHUNK_SIZE, buffer.length));
        buffer = buffer.slice(chunk.length);

        const fd = new FormData();
        fd.append("uploadId", uid);
        fd.append("chunkIndex", String(chunkIndex));
        fd.append("chunk", new Blob([chunk]), `${filename}.part${chunkIndex}`);

        const chunkRes = await fetch(
          new URL("/api/upload/chunk", context.request.url).href,
          {
            method: "POST",
            headers: {
              Authorization: request.headers.get("Authorization") || "",
              Cookie: request.headers.get("Cookie") || "",
            },
            body: fd,
          }
        );
        const chunkData = await chunkRes.json();
        telegramFileIds.push(chunkData.fileId);
        chunkIndex++;
      }

      if (done) break;
    }

    // 完成上传
    const completeRes = await fetch(
      new URL("/api/upload/complete", context.request.url).href,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: request.headers.get("Authorization") || "",
          Cookie: request.headers.get("Cookie") || "",
        },
        body: JSON.stringify({ uploadId: uid }),
      }
    );
    const completeData = await completeRes.json();
    return jsonResponse({ ok: true, ...completeData });
  } catch (e) {
    return errorResponse(e.message);
  }
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
