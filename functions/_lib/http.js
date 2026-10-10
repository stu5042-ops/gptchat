export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      ...extraHeaders,
    },
  });
}

export async function readJson(request, maxBytes = 12000) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) throw new Error("요청 내용이 너무 큽니다.");
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new Error("올바른 요청 형식이 아닙니다.");
  }
}

export function checkSameOrigin(request) {
  const origin = request.headers.get("Origin");
  const expected = new URL(request.url).origin;
  if (!origin || origin !== expected) return json({ error: "요청 출처를 확인할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도하세요." }, 403);
  return null;
}

export function isMethod(request, method) {
  if (request.method === method) return null;
  return json({ error: "지원하지 않는 요청 방식입니다." }, 405, { Allow: method });
}

export function cleanText(value, max = 5000) {
  return typeof value === "string" ? value.normalize("NFC").trim().slice(0, max) : "";
}
