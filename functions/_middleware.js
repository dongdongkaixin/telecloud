// functions/_middleware.js
// 全局中间件：JWT 鉴权 + CORS

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // 放行静态资源和公开路由
  const publicPaths = [
    "/login.html",
    "/api/auth/login",
    "/api/auth/check",
    "/assets/",
    "/favicon.ico",
  ];

  const isPublic = publicPaths.some((p) => path.startsWith(p));

  // WebDAV 路径单独鉴权（Basic Auth）
  if (path.startsWith("/api/webdav")) {
    const authHeader = request.headers.get("Authorization") || "";
    if (authHeader.startsWith("Basic ")) {
      const decoded = atob(authHeader.slice(6));
      const [user, pass] = decoded.split(":");
      if (
        user === env.ADMIN_USERNAME &&
        pass === env.ADMIN_PASSWORD
      ) {
        return next();
      }
    }
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="TeleCloud WebDAV"',
        "Content-Type": "text/plain",
      },
    });
  }

  if (!isPublic && path.startsWith("/api/")) {
    const token = getToken(request);
    if (!token || !(await verifyToken(token, env))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (!isPublic && !path.startsWith("/api/") && !path.startsWith("/assets/")) {
    const token = getCookieToken(request);
    if (!token || !(await verifyToken(token, env))) {
      return Response.redirect(new URL("/login.html", request.url).href, 302);
    }
  }

  const response = await next();

  // 添加 CORS 头
  const newResponse = new Response(response.body, response);
  newResponse.headers.set("Access-Control-Allow-Origin", "*");
  newResponse.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS, PROPFIND, MKCOL, COPY, MOVE"
  );
  newResponse.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Depth, Destination"
  );

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: newResponse.headers });
  }

  return newResponse;
}

function getToken(request) {
  const authHeader = request.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7);
  return getCookieToken(request);
}

function getCookieToken(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/tc_token=([^;]+)/);
  return match ? match[1] : null;
}

async function verifyToken(token, env) {
  try {
    const stored = await env.TC_KV.get(`session:${token}`);
    if (!stored) return false;
    const session = JSON.parse(stored);
    if (Date.now() > session.exp) {
      await env.TC_KV.delete(`session:${token}`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
