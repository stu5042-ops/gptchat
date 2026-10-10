import { json, readJson, checkSameOrigin, isMethod } from "../_lib/http.js";
import { requireUser } from "../_lib/auth.js";
export async function onRequest(context) {
  const { request, env } = context;
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  if (request.method === "GET") {
    try {
      const result = await env.DB.prepare(`
        SELECT c.id AS id,
          u.id AS other_user_id, u.name AS other_name,
          lastm.body AS last_message_body, lastm.created_at AS last_message_at,
          CASE WHEN lastm.sender_id = ? AND other_member.last_read_at IS NOT NULL AND other_member.last_read_at >= lastm.created_at THEN 1 ELSE 0 END AS last_message_read,
          (SELECT COUNT(*) FROM messages unread WHERE unread.conversation_id = c.id AND unread.sender_id <> ? AND (current_member.last_read_at IS NULL OR unread.created_at > current_member.last_read_at)) AS unread_count
        FROM conversations c
        JOIN conversation_members current_member ON current_member.conversation_id = c.id AND current_member.user_id = ?
        JOIN conversation_members other_member ON other_member.conversation_id = c.id AND other_member.user_id <> ?
        JOIN users u ON u.id = other_member.user_id
        LEFT JOIN messages lastm ON lastm.id = (SELECT m2.id FROM messages m2 WHERE m2.conversation_id = c.id ORDER BY m2.created_at DESC, m2.id DESC LIMIT 1)
        WHERE current_member.hidden_at IS NULL
        ORDER BY COALESCE(lastm.created_at, c.created_at) DESC LIMIT 200
      `).bind(auth.user.id, auth.user.id, auth.user.id, auth.user.id).all();
      return json({ conversations: result.results || [] });
    } catch {
      return json({ error: "대화 목록을 불러오지 못했습니다." }, 503);
    }
  }
  if (request.method === "POST") {
    const originError = checkSameOrigin(request);
    if (originError) return originError;
    let body;
    try { body = await readJson(request); } catch (error) { return json({ error: error.message }, 400); }
    const targetId = typeof body.userId === "string" ? body.userId : "";
    if (!targetId || targetId === auth.user.id) return json({ error: "채팅할 친구를 선택하세요." }, 400);
    try {
      const target = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(targetId).first();
      if (!target) return json({ error: "해당 사용자를 찾을 수 없습니다." }, 404);
      const [low, high] = [auth.user.id, targetId].sort();
      const now = new Date().toISOString();
      await env.DB.prepare("INSERT INTO conversations (id, user_low, user_high, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_low, user_high) DO NOTHING")
        .bind(crypto.randomUUID(), low, high, now).run();
      const conversation = await env.DB.prepare("SELECT id FROM conversations WHERE user_low = ? AND user_high = ? LIMIT 1").bind(low, high).first();
      if (!conversation) return json({ error: "대화를 만들지 못했습니다." }, 500);
      await env.DB.prepare("INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)")
        .bind(conversation.id, auth.user.id, now).run();
      await env.DB.prepare("INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)")
        .bind(conversation.id, targetId, now).run();
      await env.DB.prepare("UPDATE conversation_members SET hidden_at = NULL WHERE conversation_id = ? AND user_id = ?")
        .bind(conversation.id, auth.user.id).run();
      return json({ conversationId: conversation.id, otherUserId: targetId }, 200);
    } catch {
      return json({ error: "대화를 만들지 못했습니다. D1 설정을 확인하세요." }, 503);
    }
  }
  return json({ error: "지원하지 않는 요청 방식입니다." }, 405, { Allow: "GET, POST" });
}
