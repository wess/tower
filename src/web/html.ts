import { putHeader, text, type Conn } from "@atlas/server"

export function html(c: Conn, status: number, body: string): Conn {
  return putHeader(text(c, status, body), "content-type", "text/html; charset=utf-8")
}

export function readCookies(c: Conn): Record<string, string> {
  const raw = c.request.headers.get("cookie") ?? ""
  const out: Record<string, string> = {}
  for (const part of raw.split(";")) {
    const i = part.indexOf("=")
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export function setCookie(
  c: Conn,
  name: string,
  value: string,
  opts: { maxAge?: number; clear?: boolean } = {},
): Conn {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"]
  if (opts.clear) parts.push("Max-Age=0")
  else if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`)
  // only mark Secure when actually served over TLS (edge sets the header)
  if (c.request.headers.get("x-forwarded-proto") === "https") parts.push("Secure")
  return putHeader(c, "set-cookie", parts.join("; "))
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
