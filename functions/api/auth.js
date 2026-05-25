// functions/api/auth.js
export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // POST /api/auth/login
  if (url.pathname === "/api/auth/login") {
    return handleLogin(request, env);
  }
  return new Response("Not found", { status: 404 });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // GET /api/auth/check
  if (url.pathname === "/api/auth/check") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // GET /api/auth/logout
  if (url.pathname === "/api/auth/logout") {
    return handleLogout(request, env);
  }

  return new Response("Not found", { status: 404 });
}

async function handleLogin(request, env) {
  try {
    const body = await request.json();
    const { username, password } = body;

    const validUser =
      username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD;
    const validUpload =
      username === "upload" && password === (env.UPLOAD_PASSWORD || env.ADMIN_PASSWORD);

    if (!validUser && !validUpload) {
      return new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = generateToken();
    const role = validUser ? "admin" : "uploader";
    const session = {
      username,
      role,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7天
    };

    await env.TC_KV.put(`session:${token}`, JSON.stringify(session), {
      expirationTtl: 7 * 24 * 60 * 60,
    });

    return new Response(JSON.stringify({ token, role }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `tc_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}`,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleLogout(request, env) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/tc_token=([^;]+)/);
  if (match) {
    await env.TC_KV.delete(`session:${match[1]}`);
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "tc_token=; Path=/; Max-Age=0",
    },
  });
}

function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
