import { json, isMethod, cleanText } from "../_lib/http.js";
import { requireUser } from "../_lib/auth.js";
export async function onRequest(context) {
  const methodError = isMethod(context.request, "GET");
  if (methodError) return methodError;
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const url = new URL(context.request.url);
  const q = cleanText(url.searchParams.get("q") || "", 80).replace(/[\\%_]/g, "\\$&");
  try {
    let result;
    if (q) {
      result = await context.env.DB.prepare("SELECT id, name FROM users WHERE id <> ? AND name LIKE ? ESCAPE '\\' COLLATE NOCASE ORDER BY name COLLATE NOCASE LIMIT 100")
        .bind(auth.user.id, `%${q}%`).all();
    } else {
      result = await context.env.DB.prepare("SELECT id, name FROM users WHERE id <> ? ORDER BY name COLLATE NOCASE LIMIT 100")
        .bind(auth.user.id).all();
    }
    return json({ users: result.results || [] });
  } catch {
    return json({ error: "가입자 목록을 불러오지 못했습니다." }, 503);
  }
}
