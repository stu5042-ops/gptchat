import { json, isMethod } from "../../_lib/http.js";
import { currentUser } from "../../_lib/auth.js";
export async function onRequest(context) {
  const methodError = isMethod(context.request, "GET");
  if (methodError) return methodError;
  try {
    const user = await currentUser(context.request, context.env);
    return json({ user });
  } catch {
    return json({ error: "D1 연결을 확인하세요." }, 503);
  }
}
