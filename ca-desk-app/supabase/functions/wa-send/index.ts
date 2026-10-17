// CA Desk: send one approved WhatsApp template through Interakt.
// Called by the app with the signed-in user's session. The Interakt key never reaches the browser.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   INTERAKT_API_KEY   the key from Interakt → Settings → Developer Setting
//   OWNER_USER_ID      your user id from Supabase → Authentication → Users (only this user may send)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// WhatsApp template values may not contain new lines, tabs or more than 4 spaces in a row.
export function cleanParam(v: unknown): string {
  return String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 900);
}

export function validate(body: any): string | null {
  if (!body || typeof body !== "object") return "Missing request body";
  if (!/^91[6-9]\d{9}$/.test(String(body.phone || ""))) return "Phone must be an Indian mobile in the form 91XXXXXXXXXX";
  if (!/^[a-z0-9_]{1,512}$/.test(String(body.template || ""))) return "Template name must be lowercase letters, numbers and underscores";
  if (!Array.isArray(body.params) || body.params.length > 10) return "params must be a list of up to 10 values";
  if (body.params.some((p: unknown) => !cleanParam(p))) return "Template values cannot be empty";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);

  const apiKey = Deno.env.get("INTERAKT_API_KEY");
  const owner = Deno.env.get("OWNER_USER_ID");
  if (!apiKey || !owner) return json({ ok: false, error: "Server is missing INTERAKT_API_KEY or OWNER_USER_ID" }, 500);

  // Who is calling?
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return json({ ok: false, error: "Sign in first" }, 401);
  if (u.user.id !== owner) return json({ ok: false, error: "This account is not allowed to send messages" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Body must be JSON" }, 400); }
  const bad = validate(body);
  if (bad) return json({ ok: false, error: bad }, 400);

  const payload = {
    countryCode: "+91",
    phoneNumber: String(body.phone).slice(2),
    callbackData: String(body.callbackData || "").slice(0, 500),
    type: "Template",
    template: {
      name: body.template,
      languageCode: String(body.languageCode || "en"),
      bodyValues: body.params.map(cleanParam),
    },
  };
  try {
    const r = await fetch("https://api.interakt.ai/v1/public/message/", {
      method: "POST",
      headers: { Authorization: "Basic " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let data: any = {}; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
    if (!r.ok || data.result === false) return json({ ok: false, error: data.message || ("Interakt replied " + r.status), detail: data }, 502);
    return json({ ok: true, id: data.id || null });
  } catch (e) {
    return json({ ok: false, error: "Could not reach Interakt: " + (e as Error).message }, 502);
  }
});
