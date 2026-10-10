import { json } from "../../../../_lib/http.js";
import { requireUser } from "../../../../_lib/auth.js";

const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method !== "GET") return json({ error: "지원하지 않는 요청 방식입니다." }, 405, { Allow: "GET" });
  const auth = await requireUser(context);
  if (auth.response) return auth.response;
  const index = Number(params.index);
  if (!Number.isInteger(index) || index < 0 || index > 4) return json({ error: "첨부 파일을 찾을 수 없습니다." }, 404);
  try {
    const row = await env.DB.prepare(`
      SELECT m.attachments_json, m.attachments_data_json
      FROM messages m
      JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = ? AND cm.user_id = ? LIMIT 1
    `).bind(params.id, auth.user.id).first();
    if (!row) return json({ error: "첨부 파일을 찾을 수 없습니다." }, 404);
    const metadata = JSON.parse(row.attachments_json || "[]");
    const data = JSON.parse(row.attachments_data_json || "[]");
    const file = metadata[index];
    const payload = data[index];
    if (!file || !payload || typeof payload.dataUrl !== "string") return json({ error: "첨부 파일을 찾을 수 없습니다." }, 404);
    const match = payload.dataUrl.match(/^data:([a-zA-Z0-9.+/-]{1,120});base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return json({ error: "첨부 파일을 읽을 수 없습니다." }, 500);
    const binary = atob(match[2]);
    if (binary.length > 700 * 1024) return json({ error: "첨부 파일 크기가 올바르지 않습니다." }, 500);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const type = match[1].toLowerCase();
    const safeType = INLINE_TYPES.has(type) ? type : "application/octet-stream";
    const safeName = String(file.name || "attachment").replace(/[\\\u0000-\u001f\u007f]/g, "_").slice(0, 180) || "attachment";
    const disposition = INLINE_TYPES.has(type) ? "inline" : "attachment";
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": safeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin"
      }
    });
  } catch {
    return json({ error: "첨부 파일을 가져오지 못했습니다." }, 503);
  }
}
