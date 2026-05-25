// functions/api/download.js
// 从 Telegram 重组分块并流式返回给客户端

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const fileId = url.searchParams.get("id");
  if (!fileId) return errorResponse("Missing file id", 400);

  const raw = await env.TC_KV.get(`file:${fileId}`);
  if (!raw) return errorResponse("File not found", 404);
  const file = JSON.parse(raw);

  // 单块文件直接重定向
  if (file.totalChunks === 1) {
    const tgUrl = await getTelegramFileUrl(file.chunks[0], env);
    if (!tgUrl) return errorResponse("Failed to get file from Telegram", 502);

    const tgResp = await fetch(tgUrl);
    return new Response(tgResp.body, {
      headers: {
        "Content-Type": file.mimetype || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
        "Content-Length": String(file.size),
      },
    });
  }

  // 多块文件：流式重组
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  (async () => {
    for (let i = 0; i < file.totalChunks; i++) {
      const tgUrl = await getTelegramFileUrl(file.chunks[i], env);
      if (!tgUrl) {
        await writer.abort("Failed to get chunk from Telegram");
        return;
      }
      const resp = await fetch(tgUrl);
      const reader = resp.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    }
    await writer.close();
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": file.mimetype || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
      "X-File-Size": String(file.size),
      "Transfer-Encoding": "chunked",
    },
  });
}

async function getTelegramFileUrl(fileId, env) {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/getFile?file_id=${fileId}`
    );
    const data = await res.json();
    if (!data.ok) return null;
    return `https://api.telegram.org/file/bot${env.TG_BOT_TOKEN}/${data.result.file_path}`;
  } catch {
    return null;
  }
}

function errorResponse(msg, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
