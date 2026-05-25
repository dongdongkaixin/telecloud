// functions/api/folders.js
// 文件夹 CRUD

export async function onRequestGet(context) {
  const { env } = context;
  // 列出所有文件夹
  const raw = await env.TC_KV.get("folders:index");
  const folders = raw ? JSON.parse(raw) : [{ id: "root", name: "根目录", parentId: null, createdAt: Date.now() }];
  return jsonResponse({ folders });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.pathname === "/api/folders/create") {
    return handleCreate(request, env);
  }
  if (url.pathname === "/api/folders/delete") {
    return handleDelete(request, env);
  }
  if (url.pathname === "/api/folders/rename") {
    return handleRename(request, env);
  }

  return new Response("Not found", { status: 404 });
}

async function handleCreate(request, env) {
  try {
    const { name, parentId = "root" } = await request.json();
    if (!name) return errorResponse("Name required", 400);

    const raw = await env.TC_KV.get("folders:index");
    const folders = raw ? JSON.parse(raw) : [{ id: "root", name: "根目录", parentId: null, createdAt: Date.now() }];

    const newFolder = {
      id: generateId(),
      name,
      parentId,
      createdAt: Date.now(),
    };

    folders.push(newFolder);
    await env.TC_KV.put("folders:index", JSON.stringify(folders));
    return jsonResponse({ ok: true, folder: newFolder });
  } catch (e) {
    return errorResponse(e.message);
  }
}

async function handleDelete(request, env) {
  try {
    const { folderId } = await request.json();
    if (!folderId || folderId === "root")
      return errorResponse("Cannot delete root folder", 400);

    const raw = await env.TC_KV.get("folders:index");
    const folders = raw ? JSON.parse(raw) : [];

    // 检查文件夹是否为空
    const filesRaw = await env.TC_KV.get(`folder_files:${folderId}`);
    const files = filesRaw ? JSON.parse(filesRaw) : [];
    if (files.length > 0) {
      return errorResponse("Folder is not empty. Move or delete files first.", 400);
    }

    const updated = folders.filter((f) => f.id !== folderId);
    await env.TC_KV.put("folders:index", JSON.stringify(updated));
    await env.TC_KV.delete(`folder_files:${folderId}`);

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e.message);
  }
}

async function handleRename(request, env) {
  try {
    const { folderId, newName } = await request.json();
    if (!folderId || !newName) return errorResponse("Missing fields", 400);

    const raw = await env.TC_KV.get("folders:index");
    const folders = raw ? JSON.parse(raw) : [];
    const idx = folders.findIndex((f) => f.id === folderId);
    if (idx === -1) return errorResponse("Folder not found", 404);

    folders[idx].name = newName;
    folders[idx].updatedAt = Date.now();
    await env.TC_KV.put("folders:index", JSON.stringify(folders));

    return jsonResponse({ ok: true, folder: folders[idx] });
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
