import { json, checkSameOrigin, isMethod } from "../../_lib/http.js";
import { endSession } from "../../_lib/auth.js";
export async function onRequest(context) {
  const methodError = isMethod(context.request, "POST");
  if (methodError) return methodError;
  const originError = checkSameOrigin(context.request);
  if (originError) return originError;
  try { return json({ ok: true }, 200, { "Set-Cookie": await endSession(context.request, context.env) }); }
  catch { return json({ error: "로그아웃 처리에 실패했습니다." }, 503); }
}
