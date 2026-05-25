// functions/api/torrent.js
// 种子/磁力链接解析并调用 Cloudflare 异步任务下载
// 注意：CF Pages Functions 单次执行有 30s 限制（免费），
// 此处通过调用自身 /api/remote-upload 异步完成大文件下载

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const contentType = request.headers.get("Content-Type") || "";

  // 处理磁力链接
  if (url.pathname === "/api/torrent/magnet") {
    return handleMagnet(request, env, context);
  }

  // 处理 .torrent 文件上传
  if (url.pathname === "/api/torrent/upload" && contentType.includes("multipart")) {
    return handleTorrentFile(request, env, context);
  }

  return new Response("Not found", { status: 404 });
}

async function handleMagnet(request, env, context) {
  try {
    const { magnet, folderId = "root" } = await request.json();
    if (!magnet || !magnet.startsWith("magnet:")) {
      return errorResponse("Invalid magnet link", 400);
    }

    // 解析磁力链接中的 xt 参数获取 info hash
    const xtMatch = magnet.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
    if (!xtMatch) return errorResponse("Cannot parse magnet link", 400);
    const infoHash = xtMatch[1].toLowerCase();

    // 尝试从公共 torrent API 获取文件列表（使用 itorrents.org）
    const torrentApiUrl = `https://itorrents.org/torrent/${infoHash.toUpperCase()}.torrent`;

    // 创建任务记录
    const taskId = generateId();
    const task = {
      id: taskId,
      type: "magnet",
      magnet,
      infoHash,
      folderId,
      status: "pending",
      message: "正在解析磁力链接...",
      createdAt: Date.now(),
    };
    await env.TC_KV.put(`task:${taskId}`, JSON.stringify(task), {
      expirationTtl: 7 * 24 * 60 * 60,
    });

    // 尝试通过 itorrents 获取 .torrent 文件后解析
    fetch(torrentApiUrl)
      .then(async (resp) => {
        if (!resp.ok) throw new Error("Cannot fetch torrent from itorrents.org");
        task.status = "downloading";
        task.message = "正在从磁力链接获取种子数据...";
        await env.TC_KV.put(`task:${taskId}`, JSON.stringify(task));

        // 将整个 .torrent 作为文件存储
        const buf = await resp.arrayBuffer();
        const filename = `${infoHash}.torrent`;

        // 调用 remote-upload 下载该 torrent 对应的资源
        // 实际 BitTorrent 协议在纯 serverless 中无法完整运行
        // 此处将种子本身保存，并记录任务供外部 Alist/下载器处理
        task.status = "saved";
        task.message = "已保存磁力链接任务。请使用 Alist 或下载器通过 WebDAV 接口处理。";
        task.torrentFetched = true;
        task.downloadUrl = torrentApiUrl;
        await env.TC_KV.put(`task:${taskId}`, JSON.stringify(task));
      })
      .catch(async (e) => {
        task.status = "error";
        task.message = e.message;
        await env.TC_KV.put(`task:${taskId}`, JSON.stringify(task));
      });

    return jsonResponse({
      ok: true,
      taskId,
      message:
        "磁力链接任务已创建。由于 Cloudflare 无服务器限制，BitTorrent 协议下载需配合外部客户端（如 Alist + qBittorrent）使用。任务 ID 可用于查询状态。",
      note:
        "完整的 BT 下载需要持久化连接，建议通过 WebDAV 挂载后使用本地下载工具配合使用。",
      taskInfo: task,
    });
  } catch (e) {
    return errorResponse(e.message);
  }
}

async function handleTorrentFile(request, env, context) {
  try {
    const formData = await request.formData();
    const torrentFile = formData.get("torrent");
    const folderId = formData.get("folderId") || "root";

    if (!torrentFile) return errorResponse("No torrent file provided", 400);

    const taskId = generateId();
    const filename = torrentFile.name || "upload.torrent";

    // 将 .torrent 文件本身上传保存
    const uploadFd = new FormData();
    uploadFd.append("uploadId", "");
    // 先走 init -> chunk -> complete 流程保存 torrent 文件本身
    const initRes = await fetch(
      new URL("/api/upload/init", request.url).href,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: request.headers.get("Cookie") || "",
          Authorization: request.headers.get("Authorization") || "",
        },
        body: JSON.stringify({
          filename,
          filesize: torrentFile.size,
          mimetype: "application/x-bittorrent",
          folderId,
        }),
      }
    );
    const { uploadId } = await initRes.json();

    // 上传种子文件本身
    const chunkFd = new FormData();
    chunkFd.append("uploadId", uploadId);
    chunkFd.append("chunkIndex", "0");
    chunkFd.append("chunk", torrentFile, filename);

    await fetch(new URL("/api/upload/chunk", request.url).href, {
      method: "POST",
      headers: {
        Cookie: request.headers.get("Cookie") || "",
        Authorization: request.headers.get("Authorization") || "",
      },
      body: chunkFd,
    });

    await fetch(new URL("/api/upload/complete", request.url).href, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: request.headers.get("Cookie") || "",
        Authorization: request.headers.get("Authorization") || "",
      },
      body: JSON.stringify({ uploadId }),
    });

    // 记录任务
    const task = {
      id: taskId,
      type: "torrent",
      filename,
      folderId,
      status: "saved",
      message:
        "种子文件已保存到您的私人空间。由于 Cloudflare 无服务器架构限制，自动下载种子内容需要外部下载工具。建议通过 WebDAV 挂载后使用 Alist + qBittorrent 等工具处理。",
      createdAt: Date.now(),
    };
    await env.TC_KV.put(`task:${taskId}`, JSON.stringify(task), {
      expirationTtl: 7 * 24 * 60 * 60,
    });

    return jsonResponse({ ok: true, taskId, task });
  } catch (e) {
    return errorResponse(e.message);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const taskId = url.searchParams.get("taskId");
  if (!taskId) return errorResponse("Missing taskId", 400);

  const raw = await env.TC_KV.get(`task:${taskId}`);
  if (!raw) return errorResponse("Task not found", 404);

  return jsonResponse(JSON.parse(raw));
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
