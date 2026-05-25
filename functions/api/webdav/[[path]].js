// functions/api/webdav/[[path]].js
// WebDAV 协议实现，支持 Alist、Rclone、macOS Finder 等客户端挂载

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();
  const pathParts = params.path || [];
  const resourcePath = "/" + pathParts.join("/");

  switch (method) {
    case "OPTIONS":
      return handleOptions();
    case "PROPFIND":
      return handlePropfind(request, resourcePath, env);
    case "GET":
    case "HEAD":
      return handleGet(request, resourcePath, env, method);
    case "PUT":
      return handlePut(request, resourcePath, env);
    case "DELETE":
      return handleDelete(resourcePath, env);
    case "MKCOL":
      return handleMkcol(resourcePath, env);
    case "COPY":
    case "MOVE":
      return handleCopyMove(request, resourcePath, env, method);
    default:
      return new Response("Method Not Allowed", { status: 405 });
  }
}

function handleOptions() {
  return new Response(null, {
    status: 200,
    headers: {
      Allow: "OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, MKCOL, COPY, MOVE",
      DAV: "1, 2",
      "MS-Author-Via": "DAV",
    },
  });
}

async function handlePropfind(request, resourcePath, env) {
  const depth = request.headers.get("Depth") || "1";
  const isRoot = resourcePath === "/" || resourcePath === "";

  const foldersRaw = await env.TC_KV.get("folders:index");
  const folders = foldersRaw
    ? JSON.parse(foldersRaw)
    : [{ id: "root", name: "根目录", parentId: null }];

  let responses = [];

  if (isRoot) {
    responses.push(buildPropResponse("/api/webdav/", "根目录", true, null, Date.now()));
    if (depth !== "0") {
      for (const f of folders.filter((f) => f.id !== "root")) {
        responses.push(
          buildPropResponse(
            `/api/webdav/${encodeURIComponent(f.name)}/`,
            f.name,
            true,
            null,
            f.createdAt || Date.now()
          )
        );
      }
      // 根目录文件
      const rootFiles = await getFilesInFolder("root", env);
      for (const file of rootFiles) {
        responses.push(
          buildPropResponse(
            `/api/webdav/${encodeURIComponent(file.name)}`,
            file.name,
            false,
            file.size,
            file.createdAt
          )
        );
      }
    }
  } else {
    // 查找对应文件夹
    const folderName = decodeURIComponent(resourcePath.replace(/^\//, "").replace(/\/$/, ""));
    const folder = folders.find((f) => f.name === folderName);

    if (folder) {
      responses.push(
        buildPropResponse(
          `/api/webdav/${encodeURIComponent(folder.name)}/`,
          folder.name,
          true,
          null,
          folder.createdAt || Date.now()
        )
      );
      if (depth !== "0") {
        const files = await getFilesInFolder(folder.id, env);
        for (const file of files) {
          responses.push(
            buildPropResponse(
              `/api/webdav/${encodeURIComponent(folder.name)}/${encodeURIComponent(file.name)}`,
              file.name,
              false,
              file.size,
              file.createdAt
            )
          );
        }
      }
    } else {
      // 尝试作为文件处理
      return new Response("Not Found", { status: 404 });
    }
  }

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
${responses.join("\n")}
</D:multistatus>`;

  return new Response(xml, {
    status: 207,
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

function buildPropResponse(href, displayName, isCollection, contentLength, lastModified) {
  const lm = new Date(lastModified || Date.now()).toUTCString();
  return `<D:response>
  <D:href>${href}</D:href>
  <D:propstat>
    <D:prop>
      <D:displayname>${escapeXml(displayName)}</D:displayname>
      <D:getlastmodified>${lm}</D:getlastmodified>
      ${isCollection ? "<D:resourcetype><D:collection/></D:resourcetype>" : `<D:resourcetype/><D:getcontentlength>${contentLength || 0}</D:getcontentlength>`}
    </D:prop>
    <D:status>HTTP/1.1 200 OK</D:status>
  </D:propstat>
</D:response>`;
}

async function handleGet(request, resourcePath, env, method) {
  const parts = resourcePath.replace(/^\//, "").split("/");
  const filename = decodeURIComponent(parts[parts.length - 1]);

  // 查找文件
  const foldersRaw = await env.TC_KV.get("folders:index");
  const folders = foldersRaw ? JSON.parse(foldersRaw) : [];

  let targetFolderId = "root";
  if (parts.length > 1) {
    const folderName = decodeURIComponent(parts[0]);
    const folder = folders.find((f) => f.name === folderName);
    if (folder) targetFolderId = folder.id;
  }

  const files = await getFilesInFolder(targetFolderId, env);
  const file = files.find((f) => f.name === filename);
  if (!file) return new Response("Not Found", { status: 404 });

  if (method === "HEAD") {
    return new Response(null, {
      headers: {
        "Content-Type": file.mimetype || "application/octet-stream",
        "Content-Length": String(file.size),
        "Last-Modified": new Date(file.createdAt).toUTCString(),
      },
    });
  }

  // 重定向到下载 API
  const downloadUrl = new URL(request.url);
  downloadUrl.pathname = "/api/download";
  downloadUrl.search = `?id=${file.id}`;
  return Response.redirect(downloadUrl.href, 302);
}

async function handlePut(request, resourcePath, env) {
  const parts = resourcePath.replace(/^\//, "").split("/");
  const filename = decodeURIComponent(parts[parts.length - 1]);

  let folderId = "root";
  if (parts.length > 1) {
    const folderName = decodeURIComponent(parts[0]);
    const foldersRaw = await env.TC_KV.get("folders:index");
    const folders = foldersRaw ? JSON.parse(foldersRaw) : [];
    const folder = folders.find((f) => f.name === folderName);
    if (folder) folderId = folder.id;
  }

  const contentType =
    request.headers.get("Content-Type") || "application/octet-stream";
  const blob = await request.blob();

  // 使用内部上传 API
  const CHUNK_SIZE = 19 * 1024 * 1024;
  const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);

  const initRes = await fetch(
    new URL("/api/upload/init", request.url).href,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: request.headers.get("Cookie") || "",
      },
      body: JSON.stringify({
        filename,
        filesize: blob.size,
        mimetype: contentType,
        folderId,
      }),
    }
  );
  const { uploadId } = await initRes.json();

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, blob.size);
    const chunk = blob.slice(start, end);

    const fd = new FormData();
    fd.append("uploadId", uploadId);
    fd.append("chunkIndex", String(i));
    fd.append("chunk", chunk, `${filename}.part${i}`);

    await fetch(new URL("/api/upload/chunk", request.url).href, {
      method: "POST",
      headers: { Cookie: request.headers.get("Cookie") || "" },
      body: fd,
    });
  }

  await fetch(new URL("/api/upload/complete", request.url).href, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: request.headers.get("Cookie") || "",
    },
    body: JSON.stringify({ uploadId }),
  });

  return new Response(null, { status: 201 });
}

async function handleDelete(resourcePath, env) {
  const parts = resourcePath.replace(/^\//, "").split("/");
  const filename = decodeURIComponent(parts[parts.length - 1]);

  let folderId = "root";
  if (parts.length > 1) {
    const foldersRaw = await env.TC_KV.get("folders:index");
    const folders = foldersRaw ? JSON.parse(foldersRaw) : [];
    const folderName = decodeURIComponent(parts[0]);
    const folder = folders.find((f) => f.name === folderName);
    if (folder) folderId = folder.id;
  }

  const files = await getFilesInFolder(folderId, env);
  const file = files.find((f) => f.name === filename);
  if (!file) return new Response("Not Found", { status: 404 });

  await env.TC_KV.delete(`file:${file.id}`);
  const idxKey = `folder_files:${folderId}`;
  const idxRaw = await env.TC_KV.get(idxKey);
  if (idxRaw) {
    const ids = JSON.parse(idxRaw).filter((id) => id !== file.id);
    await env.TC_KV.put(idxKey, JSON.stringify(ids));
  }

  return new Response(null, { status: 204 });
}

async function handleMkcol(resourcePath, env) {
  const folderName = decodeURIComponent(
    resourcePath.replace(/^\//, "").replace(/\/$/, "")
  );
  if (!folderName)
    return new Response("Bad Request", { status: 400 });

  const raw = await env.TC_KV.get("folders:index");
  const folders = raw
    ? JSON.parse(raw)
    : [{ id: "root", name: "根目录", parentId: null, createdAt: Date.now() }];

  if (folders.find((f) => f.name === folderName)) {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const newFolder = {
    id: generateId(),
    name: folderName,
    parentId: "root",
    createdAt: Date.now(),
  };
  folders.push(newFolder);
  await env.TC_KV.put("folders:index", JSON.stringify(folders));
  return new Response(null, { status: 201 });
}

async function handleCopyMove(request, resourcePath, env, method) {
  const destination = request.headers.get("Destination");
  if (!destination) return new Response("Bad Request", { status: 400 });
  // 简化实现：MOVE 等同于重命名文件
  return new Response("Not Implemented", { status: 501 });
}

async function getFilesInFolder(folderId, env) {
  const idxRaw = await env.TC_KV.get(`folder_files:${folderId}`);
  const ids = idxRaw ? JSON.parse(idxRaw) : [];
  const files = [];
  for (const id of ids) {
    const raw = await env.TC_KV.get(`file:${id}`);
    if (raw) files.push(JSON.parse(raw));
  }
  return files;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
