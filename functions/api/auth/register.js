import { json, readJson, checkSameOrigin, isMethod, cleanText } from "../../_lib/http.js";
import { makePasswordHash, randomHex, startSession } from "../../_lib/auth.js";

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
  if (name.length < 1) return json({ error: "이름을 1~40자로 입력하세요." }, 400);
  if (name.length > 40) return json({ error: "이름은 40자 이하여야 합니다." }, 400);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "올바른 이메일 주소를 입력하세요." }, 400);
  if (password.length < 10 || password.length > 128) return json({ error: "비밀번호는 10~128자로 입력하세요." }, 400);

  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const { salt, hash, iterations } = await makePasswordHash(password);
    await env.DB.prepare("INSERT INTO users (id, name, email, password_hash, password_salt, password_iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, name, email, hash, salt, iterations, now).run();
    const cookie = await startSession(request, env, id);
    return json({ user: { id, name, email } }, 201, { "Set-Cookie": cookie });
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("unique") || String(error?.message || "").toLowerCase().includes("constraint")) {
      return json({ error: "이미 가입된 이메일입니다. 로그인해 주세요." }, 409);
    }
    return json({ error: "가입에 실패했습니다. D1 데이터베이스와 마이그레이션 설정을 확인하세요." }, 500);
  }
}
