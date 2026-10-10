import { json } from "./http.js";

const encoder = new TextEncoder();
export const PASSWORD_ITERATIONS = 310000;
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < result.length; i++) result[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return result;
}
export function randomHex(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}
export async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}
export async function makePasswordHash(password, salt = randomHex(16), iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(salt), iterations }, key, 256);
  return { salt, hash: bytesToHex(new Uint8Array(derived)), iterations };
}
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}
export async function verifyPassword(password, user) {
  const candidate = await makePasswordHash(password, user.password_salt, Number(user.password_iterations));
  return constantTimeEqual(candidate.hash, user.password_hash);
}

function readCookie(request, cookieName) {
  const header = request.headers.get("Cookie") || "";
  for (const item of header.split(";")) {
    const index = item.indexOf("=");
    if (index < 0) continue;
    if (item.slice(0, index).trim() === cookieName) return item.slice(index + 1).trim();
  }
  return "";
}
function cookieOptions(request, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
export async function startSession(request, env, userId) {
  const token = randomHex(32);
  const now = new Date();
  const expiry = new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString();
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now.toISOString()).run();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), userId, expiry, now.toISOString()).run();
  return cookieOptions(request, SESSION_SECONDS).replace("Path=/", `session=${token}; Path=/`);
}
export async function endSession(request, env) {
  const token = readCookie(request, "session");
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return cookieOptions(request, 0).replace("Path=/", "session=; Path=/");
}
export async function currentUser(request, env) {
  const token = readCookie(request, "session");
  if (!token) return null;
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    "SELECT u.id, u.name, u.email, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1"
  ).bind(await sha256(token), now).first();
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email };
}
export async function requireUser(context) {
  try {
    const user = await currentUser(context.request, context.env);
    return user ? { user, response: null } : { user: null, response: json({ error: "로그인이 필요합니다." }, 401) };
  } catch (error) {
    return { user: null, response: json({ error: "인증 정보를 확인하지 못했습니다. D1 연결 설정을 확인하세요." }, 503) };
  }
}
