import { json, checkSameOrigin, isMethod } from "../../_lib/http.js";
import { requireUser } from "../../_lib/auth.js";
export async function onRequest(context) {
  const { request, env, params } = context;
  const methodError = isMethod(request, "DELETE");
  if (methodError) return methodError;
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  try {
    const result = await env.DB.prepare("UPDATE conversation_members SET hidden_at = ? WHERE conversation_id = ? AND user_id = ?")
      .bind(new Date().toISOString(), params.id, auth.user.id).run();
    if (!result.meta?.changes) return json({ error: "대화를 찾을 수 없습니다." }, 404);
    return json({ ok: true });
  } catch {
    return json({ error: "대화를 삭제하지 못했습니다." }, 503);
  }
}
