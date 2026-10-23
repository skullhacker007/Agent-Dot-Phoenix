import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "agent-admin-session";
const SESSION_DURATION_SECONDS = 8 * 60 * 60;

function getConfiguredSecret(name: string) {
  const value = process.env[name];
  if (!value || Buffer.byteLength(value) < 32) {
    throw new Error(`${name} must be configured with at least 32 bytes.`);
  }
  return value;
}

function signSession(expiry: string) {
  return createHmac("sha256", getConfiguredSecret("AGENT_ADMIN_SESSION_SECRET"))
    .update(`agent-admin:${expiry}`)
    .digest("base64url");
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export function hasValidAdminToken(candidate: string) {
  const expected = getConfiguredSecret("AGENT_ADMIN_TOKEN");
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return (
    candidateBytes.length === expectedBytes.length &&
    timingSafeEqual(candidateBytes, expectedBytes)
  );
}

export function createAdminSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const expiry = expiresAt.toString(36);
  return {
    value: `${expiry}.${signSession(expiry)}`,
    maxAge: SESSION_DURATION_SECONDS,
  };
}

export function isAdminSessionValid(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return false;

  const sessionValue = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${ADMIN_SESSION_COOKIE}=`))
    ?.slice(ADMIN_SESSION_COOKIE.length + 1);
  if (!sessionValue) return false;

  const [expiry, signature, ...extra] = sessionValue.split(".");
  if (!expiry || !signature || extra.length) return false;

  const expiresAt = Number.parseInt(expiry, 36);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = Buffer.from(signSession(expiry));
  const received = Buffer.from(signature);
  return (
    expected.length === received.length &&
    timingSafeEqual(expected, received)
  );
}

export function serializeAdminCookie(value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=${value}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function clearAdminCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}`;
}
