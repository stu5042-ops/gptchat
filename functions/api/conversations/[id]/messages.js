import { json, readJson, checkSameOrigin } from "../../../_lib/http.js";
import { requireUser } from "../../../_lib/auth.js";
export async function onRequest(context) {
  const { request, env, params } = context;
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const conversationId = params.id;

  if (request.method === "GET") {
    try {
      const membership = await env.DB.prepare("SELECT 1 AS ok FROM conversation_members WHERE conversation_id = ? AND user_id = ?")
        .bind(conversationId, auth.user.id).first();
      if (!membership) return json({ error: "대화를 찾을 수 없습니다." }, 404);
      const now = new Date().toISOString();
      await env.DB.prepare("UPDATE conversation_members SET last_read_at = ?, hidden_at = NULL WHERE conversation_id = ? AND user_id = ?")
        .bind(now, conversationId, auth.user.id).run();
      const result = await env.DB.prepare(`
        SELECT m.id, m.conversation_id, m.sender_id, m.body, m.reply_to_message_id, m.created_at, m.attachments_json,
          sender.name AS sender_name,
          parent.body AS reply_body, parent.sender_id AS reply_sender_id,
          (SELECT COUNT(*) FROM message_likes ml WHERE ml.message_id = m.id) AS like_count,
          EXISTS(SELECT 1 FROM message_likes mine WHERE mine.message_id = m.id AND mine.user_id = ?) AS liked,
          CASE WHEN m.sender_id = ? THEN CASE WHEN other_member.last_read_at IS NOT NULL AND other_member.last_read_at >= m.created_at THEN 1 ELSE 0 END ELSE NULL END AS is_read
        FROM messages m
        JOIN users sender ON sender.id = m.sender_id
        LEFT JOIN messages parent ON parent.id = m.reply_to_message_id
        JOIN conversation_members current_member ON current_member.conversation_id = m.conversation_id AND current_member.user_id = ?
        JOIN conversation_members other_member ON other_member.conversation_id = m.conversation_id AND other_member.user_id <> ?
        WHERE m.conversation_id = ?
        ORDER BY m.created_at ASC, m.id ASC LIMIT 250
      `).bind(auth.user.id, auth.user.id, auth.user.id, auth.user.id, conversationId).all();
      const messages = (result.results || []).map((row) => {
        let attachments = [];
        try { attachments = JSON.parse(row.attachments_json || "[]"); } catch { attachments = []; }
        const { attachments_json, ...message } = row;
        return { ...message, attachments: Array.isArray(attachments) ? attachments : [] };
      });
      return json({ messages });
    } catch {
      return json({ error: "메시지를 불러오지 못했습니다." }, 503);
    }
  }

  if (request.method === "POST") {
    const originError = checkSameOrigin(request);
    if (originError) return originError;
    let body;
    try { body = await readJson(request, 1300000); } catch (error) { return json({ error: error.message }, 400); }
    const text = typeof body.body === "string" ? body.body.normalize("NFC").trim() : "";
    const replyTo = typeof body.replyTo === "string" && body.replyTo.length <= 80 ? body.replyTo : null;
    const incoming = Array.isArray(body.attachments) ? body.attachments : [];
    if (incoming.length > 5) return json({ error: "파일은 한 메시지에 최대 5개까지 첨부할 수 있습니다." }, 400);
    if (text.length > 5000) return json({ error: "메시지는 5,000자 이하여야 합니다." }, 400);
    const attachments = [];
    let totalBytes = 0;
    for (const item of incoming) {
      if (!item || typeof item !== "object" || typeof item.dataUrl !== "string" || item.dataUrl.length > 1000000) {
        return json({ error: "첨부 파일 형식이 올바르지 않습니다." }, 400);
      }
      const match = item.dataUrl.match(/^data:([a-zA-Z0-9.+/-]{1,120});base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return json({ error: "지원하지 않는 첨부 파일 형식입니다." }, 400);
      const base64 = match[2];
      const size = Math.floor(base64.length * 3 / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
      if (size < 0 || size > 700 * 1024) return json({ error: "첨부 파일 하나는 700KB 이하여야 합니다." }, 400);
      totalBytes += size;
      if (totalBytes > 700 * 1024) return json({ error: "첨부 파일 전체 합계는 700KB 이하여야 합니다." }, 400);
      const name = String(item.name || "첨부 파일").replace(/[\/\\\u0000-\u001f\u007f]/g, "_").slice(0, 180) || "첨부 파일";
      const type = match[1].toLowerCase();
      attachments.push({ name, type, size });
    }
    if (!text && attachments.length === 0) return json({ error: "메시지나 첨부 파일을 입력하세요." }, 400);
    const storedBody = text || "첨부 파일";
    const attachmentData = incoming.map((item, index) => ({
      name: attachments[index].name,
      type: attachments[index].type,
      size: attachments[index].size,
      dataUrl: item.dataUrl
    }));
    try {
      const member = await env.DB.prepare("SELECT 1 AS ok FROM conversation_members WHERE conversation_id = ? AND user_id = ?")
        .bind(conversationId, auth.user.id).first();
      if (!member) return json({ error: "대화를 찾을 수 없습니다." }, 404);
      if (replyTo) {
        const parent = await env.DB.prepare("SELECT id FROM messages WHERE id = ? AND conversation_id = ?").bind(replyTo, conversationId).first();
        if (!parent) return json({ error: "답장할 메시지를 찾을 수 없습니다." }, 400);
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare("INSERT INTO messages (id, conversation_id, sender_id, body, reply_to_message_id, created_at, attachments_json, attachments_data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, conversationId, auth.user.id, storedBody, replyTo, now, JSON.stringify(attachments), JSON.stringify(attachmentData)).run();
      await env.DB.prepare("UPDATE conversation_members SET hidden_at = NULL WHERE conversation_id = ?").bind(conversationId).run();
      return json({ message: { id, conversation_id: conversationId, sender_id: auth.user.id, sender_name: auth.user.name, body: storedBody, reply_to_message_id: replyTo, created_at: now, attachments, like_count: 0, liked: 0, is_read: 0 } }, 201);
    } catch {
      return json({ error: "메시지를 보내지 못했습니다. D1 바인딩과 database.sql 적용 여부를 확인하세요." }, 503);
    }
  }
  return json({ error: "지원하지 않는 요청 방식입니다." }, 405, { Allow: "GET, POST" });
}
