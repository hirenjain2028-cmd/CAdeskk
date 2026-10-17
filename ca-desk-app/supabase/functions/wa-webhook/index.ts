// CA Desk: receives Interakt webhooks.
//  - message_received: a client wrote or sent a file. Files are copied into private storage
//    so CA Desk can suggest the client (by sender number) and file them on the PC.
//  - message_api_sent / delivered / read / failed: updates the reminder's status.
//
// Secrets:
//   OWNER_USER_ID     same as wa-send
//   WEBHOOK_TOKEN     any long random text; put it at the end of the webhook URL as ?token=...
//   INTERAKT_WEBHOOK_SECRET (optional) if Interakt gives you a signing secret, signatures are checked too
// Deploy this function with "Verify JWT" turned OFF, because Interakt cannot sign in.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ok = (msg = "ok") => new Response(msg, { status: 200 });

export function digits(v: unknown) { return String(v ?? "").replace(/\D/g, ""); }
export function normPhone(cc: unknown, num: unknown): string {
  let d = digits(num);
  const c = digits(cc) || "91";
  if (d.length === 10) d = c + d;
  if (d.length === 11 && d.startsWith("0")) d = "91" + d.slice(1);
  return d;
}
const EXT: Record<string, string> = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx", "application/vnd.ms-excel": ".xls", "application/msword": ".doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx", "text/csv": ".csv", "application/zip": ".zip" };
export function fileNameFor(url: string, mime: string, given: string, when: Date): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
  if (given && /\.[a-z0-9]{2,5}$/i.test(given)) return safe(given);
  try { const last = decodeURIComponent(new URL(url).pathname.split("/").pop() || ""); if (/\.[a-z0-9]{2,5}$/i.test(last) && last.length < 120) return safe(last); } catch { /* ignore */ }
  const ext = EXT[mime.split(";")[0].trim()] || "";
  return "WhatsApp file " + when.toISOString().slice(0, 16).replace("T", " ").replace(":", ".") + ext;
}
// Interakt's exact field names may vary; look in the likely places.
export function parseIncoming(body: any) {
  const d = body?.data ?? {};
  const m = d.message ?? {};
  const cust = d.customer ?? {};
  const phone = normPhone(cust.country_code ?? cust.countryCode, cust.phone_number ?? cust.phoneNumber ?? cust.channel_phone_number ?? d.phone_number);
  let raw: any = m.message;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { /* plain text */ } }
  if (!raw || typeof raw !== "object") raw = {};
  const text = typeof m.message === "string" && !String(m.message).trim().startsWith("{") ? m.message : (raw?.caption ?? raw?.text ?? raw?.body ?? "");
  return {
    id: String(m.id ?? d.id ?? crypto.randomUUID()),
    phone,
    name: String(cust.traits?.name ?? cust.name ?? ""),
    type: String(m.message_content_type ?? m.type ?? ""),
    mediaUrl: String(m.media_url ?? raw?.media_url ?? raw?.link ?? ""),
    mediaName: String(raw?.filename ?? raw?.file_name ?? m.media_name ?? ""),
    text: String(text ?? "").slice(0, 1000),
    at: String(m.received_at_utc ?? new Date().toISOString()),
  };
}
export function parseStatus(body: any) {
  const d = body?.data ?? {};
  const m = d.message ?? {};
  const t = String(body?.type ?? "");
  const status = t.replace(/^message_(api|campaign)_/, "");
  return {
    status, // sent | delivered | read | failed
    nudgeId: String(m.meta_data ?? m.Meta_data ?? m.callback_data ?? d.callbackData ?? "").trim(),
    error: String(m.channel_failure_reason ?? m.channel_error_code ?? ""),
  };
}
async function hmacHex(secret: string, raw: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") return ok("CA Desk webhook is running");
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  const token = Deno.env.get("WEBHOOK_TOKEN");
  if (!token || url.searchParams.get("token") !== token) return new Response("Forbidden", { status: 403 });
  const raw = await req.text();
  const secret = Deno.env.get("INTERAKT_WEBHOOK_SECRET");
  if (secret) {
    const got = (req.headers.get("interakt-signature") || "").replace(/^sha256=/, "");
    if (!got || got !== await hmacHex(secret, raw)) return new Response("Bad signature", { status: 401 });
  }
  let body: any; try { body = JSON.parse(raw); } catch { return ok("ignored: not JSON"); }

  const owner = Deno.env.get("OWNER_USER_ID")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const type = String(body.type ?? "");

  // Keep the last 20 raw events, so a setup problem can be diagnosed from Settings.
  try {
    const { data: lg } = await admin.from("records").select("data").eq("user_id", owner).eq("id", "walog").maybeSingle();
    const list = [{ at: new Date().toISOString(), type, body: raw.slice(0, 2000) }, ...((lg?.data as any)?.list ?? [])].slice(0, 20);
    await admin.from("records").upsert({ user_id: owner, id: "walog", kind: "walog", data: { list }, updated_at: new Date().toISOString() }, { onConflict: "user_id,id" });
  } catch { /* logging must never block */ }

  if (type === "message_received") {
    const m = parseIncoming(body);
    const rec: any = { id: m.id, phone: m.phone, name: m.name, text: m.text, msgType: m.type, at: m.at, file: null };
    if (m.mediaUrl) {
      try {
        const r = await fetch(m.mediaUrl);
        if (r.ok) {
          const mime = r.headers.get("content-type") || "application/octet-stream";
          const blob = await r.blob();
          const name = fileNameFor(m.mediaUrl, mime, m.mediaName, new Date());
          const path = owner + "/wa-" + m.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) + "-" + name.replace(/[^a-zA-Z0-9._ -]/g, "_");
          const up = await admin.storage.from("handoff").upload(path, blob, { contentType: mime, upsert: true });
          if (!up.error) rec.file = { path, name, mime, size: blob.size };
          else rec.fileError = up.error.message;
        } else rec.fileError = "Download failed: " + r.status;
      } catch (e) { rec.fileError = (e as Error).message; }
    }
    await admin.from("records").upsert({ user_id: owner, id: "inbox:" + rec.id, kind: "inbox", data: rec, updated_at: new Date().toISOString() }, { onConflict: "user_id,id" });
    return ok();
  }

  if (/^message_(api|campaign)_(sent|delivered|read|failed)$/.test(type)) {
    const s = parseStatus(body);
    if (!s.nudgeId) return ok("no callback data");
    const id = "nudge:" + s.nudgeId;
    const { data: row } = await admin.from("records").select("data").eq("user_id", owner).eq("id", id).maybeSingle();
    if (!row) return ok("unknown nudge");
    const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };
    const cur = (row.data as any) || {};
    if ((rank[s.status] || 0) <= (rank[cur.waStatus] || 0) && s.status !== "failed") return ok("older status");
    const next = { ...cur, waStatus: s.status, waStatusAt: new Date().toISOString(), waError: s.status === "failed" ? s.error : (cur.waError || "") };
    await admin.from("records").update({ data: next, updated_at: new Date().toISOString() }).eq("user_id", owner).eq("id", id);
    return ok();
  }
  return ok("ignored");
});
