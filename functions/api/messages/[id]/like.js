import { json, checkSameOrigin, isMethod } from "../../../_lib/http.js";
import { requireUser } from "../../../_lib/auth.js";
export async function onRequest(context) {
  const { request, env, params } = context;
  const methodError = isMethod(request, "POST");
  if (methodError) return methodError;
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  try {
    const message = await env.DB.prepare("SELECT m.id, m.conversation_id FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id WHERE m.id = ? AND cm.user_id = ? LIMIT 1")
      .bind(params.id, auth.user.id).first();
    if (!message) return json({ error: "메시지를 찾을 수 없습니다." }, 404);
    const existing = await env.DB.prepare("SELECT 1 AS liked FROM message_likes WHERE message_id = ? AND user_id = ?")
      .bind(params.id, auth.user.id).first();
    const now = new Date().toISOString();
    if (existing) {
      await env.DB.prepare("DELETE FROM message_likes WHERE message_id = ? AND user_id = ?").bind(params.id, auth.user.id).run();
    } else {
      await env.DB.prepare("INSERT OR IGNORE INTO message_likes (message_id, user_id, created_at) VALUES (?, ?, ?)").bind(params.id, auth.user.id, now).run();
    }
    const result = await env.DB.prepare("SELECT COUNT(*) AS count FROM message_likes WHERE message_id = ?").bind(params.id).first();
    return json({ liked: !existing, likeCount: Number(result?.count || 0) });
  } catch {
    return json({ error: "좋아요를 처리하지 못했습니다." }, 503);
  }
}
