// functions/api/settings.js
// 系统设置 CRUD（需 admin 权限）

export async function onRequestGet(context) {
  const { env } = context;
  const raw = await env.TC_KV.get("system:settings");
  const settings = raw
    ? JSON.parse(raw)
    : {
        siteName: "TeleCloud",
        allowPublicUpload: false,
        maxFileSizeGB: 10,
        tgBotToken: "",
        tgChannelId: "",
        adminUsername: "",
        theme: "dark",
        language: "zh",
      };
  // 不返回敏感信息
  delete settings.tgBotToken;
  delete settings.adminPassword;
  return jsonResponse(settings);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // 验证是否为 admin
  const token = getToken(request);
  if (!token) return errorResponse("Unauthorized", 401);
  const sessionRaw = await env.TC_KV.get(`session:${token}`);
  if (!sessionRaw) return errorResponse("Unauthorized", 401);
  const session = JSON.parse(sessionRaw);
  if (session.role !== "admin") return errorResponse("Forbidden", 403);

  try {
    const updates = await request.json();
    const raw = await env.TC_KV.get("system:settings");
    const current = raw ? JSON.parse(raw) : {};
    const newSettings = { ...current, ...updates, updatedAt: Date.now() };
    await env.TC_KV.put("system:settings", JSON.stringify(newSettings));
    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse(e.message);
  }
}

function getToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/tc_token=([^;]+)/);
  return m ? m[1] : null;
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
