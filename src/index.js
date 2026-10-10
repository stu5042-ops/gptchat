import { onRequest as login } from "../functions/api/auth/login.js";
import { onRequest as logout } from "../functions/api/auth/logout.js";
import { onRequest as me } from "../functions/api/auth/me.js";
import { onRequest as register } from "../functions/api/auth/register.js";
import { onRequest as conversations } from "../functions/api/conversations.js";
import { onRequest as conversation } from "../functions/api/conversations/[id].js";
import { onRequest as messages } from "../functions/api/conversations/[id]/messages.js";
import { onRequest as users } from "../functions/api/users.js";
import { onRequest as like } from "../functions/api/messages/[id]/like.js";
import { onRequest as attachment } from "../functions/api/messages/[id]/attachments/[index].js";

const json = (data, status = 404) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
});

function route(pathname) {
  if (pathname === "/api/auth/login") return { handler: login, params: {} };
  if (pathname === "/api/auth/logout") return { handler: logout, params: {} };
  if (pathname === "/api/auth/me") return { handler: me, params: {} };
  if (pathname === "/api/auth/register") return { handler: register, params: {} };
  if (pathname === "/api/conversations") return { handler: conversations, params: {} };
  if (pathname === "/api/users") return { handler: users, params: {} };

  let match = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (match) return { handler: messages, params: { id: decodeURIComponent(match[1]) } };
  match = pathname.match(/^\/api\/conversations\/([^/]+)$/);
  if (match) return { handler: conversation, params: { id: decodeURIComponent(match[1]) } };
  match = pathname.match(/^\/api\/messages\/([^/]+)\/like$/);
  if (match) return { handler: like, params: { id: decodeURIComponent(match[1]) } };
  match = pathname.match(/^\/api\/messages\/([^/]+)\/attachments\/([0-4])$/);
  if (match) return { handler: attachment, params: { id: decodeURIComponent(match[1]), index: match[2] } };
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const selected = route(url.pathname);
      if (!selected) return json({ error: "API 경로를 찾을 수 없습니다." }, 404);
      try {
        return await selected.handler({ request, env, ctx, params: selected.params, waitUntil: ctx?.waitUntil?.bind(ctx) });
      } catch (error) {
        return json({ error: "서버에서 요청을 처리하지 못했습니다." }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
