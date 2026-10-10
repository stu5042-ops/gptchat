import { json, readJson, checkSameOrigin, isMethod, cleanText } from "../../_lib/http.js";
import { sha256, verifyPassword, startSession } from "../../_lib/auth.js";

export async function onRequest(context) {
  const { request, env } = context;
  const methodError = isMethod(request, "POST");
  if (methodError) return methodError;
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  let body;
  try { body = await readJson(request); } catch (error) { return json({ error: error.message }, 400); }
  const name = typeof body.name === "string" ? body.name.normalize("NFC").trim() : "";
  const email = cleanText(body.email, 254).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!name || name.length > 40 || !email || !password || password.length > 128) return json({ error: "이름, 이메일, 비밀번호를 확인하세요." }, 400);

  try {
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    const identifier = await sha256(`${email}|${clientIp}`);
    const now = new Date();
    const windowStart = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
    await env.DB.prepare("DELETE FROM login_attempts WHERE attempted_at < ?").bind(windowStart).run();
    const attempts = await env.DB.prepare("SELECT COUNT(*) AS count FROM login_attempts WHERE identifier_hash = ? AND attempted_at >= ?")
      .bind(identifier, windowStart).first();
    if (Number(attempts?.count || 0) >= 8) return json({ error: "로그인 시도가 너무 많습니다. 15분 후 다시 시도하세요." }, 429);
    await env.DB.prepare("INSERT INTO login_attempts (id, identifier_hash, attempted_at) VALUES (?, ?, ?)")
      .bind(crypto.randomUUID(), identifier, now.toISOString()).run();

    const user = await env.DB.prepare("SELECT id, name, email, password_hash, password_salt, password_iterations FROM users WHERE email = ? COLLATE NOCASE LIMIT 1")
      .bind(email).first();
    const validPassword = user ? await verifyPassword(password, user) : false;
    const validName = user ? user.name.toLocaleLowerCase() === name.toLocaleLowerCase() : false;
    if (!validPassword || !validName) return json({ error: "이름, 이메일 또는 비밀번호가 올바르지 않습니다." }, 401);

    await env.DB.prepare("DELETE FROM login_attempts WHERE identifier_hash = ?").bind(identifier).run();
    const cookie = await startSession(request, env, user.id);
    return json({ user: { id: user.id, name: user.name, email: user.email } }, 200, { "Set-Cookie": cookie });
  } catch (error) {
    return json({ error: "로그인에 실패했습니다. 잠시 후 다시 시도하세요." }, 503);
  }
}
