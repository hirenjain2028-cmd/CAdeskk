# CA Desk

Your filing season, remembered. One CA's assistant for chasing documents, ticking them off, filing them into client folders and sending WhatsApp reminders.

## Trying it out (evaluators start here)

The first screen offers two options:

- **Upload my client list:** real use. Reminders go to real clients on WhatsApp, one by one from your phone straight away, or all at once once WhatsApp Business is connected (see below).
- **Try the demo:** made-up clients, no files, accounts or phone needed. Nothing is sent and nothing is written to disk.

**Try the demo** opens a two-minute tour first. Each scroll (or arrow key, Page Down or space) moves exactly one step: the text, picture and background change in place, one part of CA Desk at a time, from what it is to the Today list, "Log a call", document matching and privacy. "Skip to the demo app" is always at the top. The tour can be reopened from the Today screen.

In the demo app, every section has a "What this does" box explaining it, and the **Try this** card on the Today screen walks through the main flows:

1. **See how a WhatsApp reminder works.** Pressing Nudge opens a five-step picture walkthrough of the connected workflow, using that client's real data: the reminder written, sent from your number, delivered and read, the client sending the document back, CA Desk matching and filing it.
2. **See a family that shares one number.** Rakesh, Sunita and Rakesh Mehta HUF get one combined reminder.
3. **Receive documents.** Adds sample PDFs that are matched to the right client by the PAN printed on them, one flagged as the wrong year, and a photo with no readable text to sort by hand.
4. **Import a client list from Excel.** Runs the real import (column matching, phone clean-up, error report) on a sample list of 25 clients.

The latest result of every action stays on screen under "Last action".

## What's in this folder

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app |
| `lib/` | Excel reader, PDF reader and sign-in library, bundled so the app works without outside websites |
| `sw.js`, `manifest.webmanifest`, `icons/` | Makes it installable on phones and lets Android share files into it |
| `_redirects` | Netlify routing for files shared from Android |
| `supabase-schema.sql` | One-time database setup (only if you turn on sign-in) |
| `supabase/functions/` | Two small server functions for WhatsApp through Interakt (`wa-send`, `wa-webhook`) |
| `src/` | The same code as `app.js`, split into readable parts. Not needed for deploying. |

## Publish on Netlify (2 minutes)

The folder already contains Netlify's configuration:

| File | What it does |
|---|---|
| `netlify.toml` | Tells Netlify there is no build step and to publish the folder as it is |
| `_headers` | Security rules (which outside sites the app may talk to: only Supabase and Google Fonts) and caching (the app always checks for updates; libraries are cached for a week) |
| `_redirects` | Routing for files shared into CA Desk from Android |


1. Go to app.netlify.com/drop.
2. Drag this whole folder onto the page.
3. Open the link Netlify gives you **in Chrome or Edge**. Rename the site under Site configuration if you like.

That's it. The app works straight away, saving data in the browser on that device.

Other ways to deploy, if you prefer:
- **From GitHub:** put this folder in a repository, then in Netlify choose Add new site → Import an existing project. Leave the build command empty and the publish directory as the repository root. Every push redeploys.
- **From the command line:** `npm install -g netlify-cli`, then `netlify login`, then `netlify deploy --dir=. --prod` from inside this folder.

## Turn on sign-in and server storage (Supabase, ~15 minutes)

Do this when you want data on a server and the phone and PC sharing one client list.

1. Create a project at supabase.com. Pick the Mumbai region if it's offered.
2. **SQL Editor → New query**, paste all of `supabase-schema.sql`, press **Run**.
3. **Authentication → Sign In / Providers → Email**: make sure Email is enabled.
4. **Authentication → Email Templates → Magic Link**: add `{{ .Token }}` to the email body so users receive a code, e.g. `Your CA Desk code is {{ .Token }}`.
5. **Authentication → URL Configuration**: set Site URL to your Netlify link.
6. **Project Settings → API**: copy the Project URL and the `anon` public key.
7. In CA Desk: **Settings → Account and sync**, paste both, press Connect, then sign in with your email and the code.

The first sign-in uploads whatever is on that device. Every other device that signs in gets the same data.

## WhatsApp through Interakt (optional, after Supabase is set up)

Sending one by one from your phone works with no setup. Connect WhatsApp Business to send the whole list in one go, see delivered and read ticks, and have documents clients send on WhatsApp arrive in CA Desk by themselves. "Send all" only appears once every step in Settings → WhatsApp shows Done; until then nothing is sent automatically. It is never available in the demo.

### 1. Move the number to the WhatsApp Business app (on the phone)
1. Back up WhatsApp chats first (WhatsApp → Settings → Chats → Chat backup).
2. Install **WhatsApp Business** from the Play Store / App Store and register the **same number**. It offers to move the existing chats across.
3. Update it to version 2.24.17 or later. Use it normally for at least 7 days before connecting it to Interakt.
4. Know this before connecting: WhatsApp on a Windows computer may stop working for that number afterwards.

### 2. Connect the number in Interakt
1. Sign up at interakt.shop and choose to connect your **existing WhatsApp Business app number** (coexistence). Follow the Meta sign-in steps.
2. **Templates**: create three templates, category **Utility**. Copy the wording from CA Desk → Settings → WhatsApp ("Wording to submit for approval"). Suggested names: `cadesk_reminder_hinglish` (language English), `cadesk_reminder_english` (English), `cadesk_reminder_hindi` (Hindi). Wait for approval.
3. **API key**: Settings → Developer Setting → copy the API key.

### 3. Deploy the two server functions (Supabase)
With the Supabase CLI (from this folder):
```
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy wa-send
supabase functions deploy wa-webhook --no-verify-jwt
```
Or in the dashboard: Edge Functions → Deploy a new function → paste each `index.ts`. For `wa-webhook`, turn **off** "Verify JWT" (Interakt cannot sign in).

Set the secrets (Edge Functions → Secrets, or `supabase secrets set NAME=value`):

| Secret | Value |
|---|---|
| `INTERAKT_API_KEY` | the key from Interakt |
| `OWNER_USER_ID` | your user id: Authentication → Users → your email → copy the UID (sign in to CA Desk once first) |
| `WEBHOOK_TOKEN` | any long random text, e.g. 40 letters and numbers |
| `INTERAKT_WEBHOOK_SECRET` | optional: only if Interakt gives you a signing secret |

Then turn off new sign-ups so nobody else can create an account: Authentication → Sign In / Providers → untick "Allow new users to sign up".

### 4. Point Interakt at CA Desk
Interakt → Settings → Developer Setting → Webhook configuration:
- URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/wa-webhook?token=YOUR_WEBHOOK_TOKEN`
- Events: message received from customers, and sent / delivered / read / failed for messages sent via API.

### 5. Switch it on in CA Desk
Settings → WhatsApp → **Send through Interakt**. Type the three template names exactly as approved. Press **Send test** with your own number.
Under "Messages from Interakt" you'll see events arriving. If documents or ticks don't show up, open "Show the raw events" and send that text to whoever maintains the app: Interakt's field names are matched defensively but have not been tested against a live account.

### Costs
Meta charges per delivered template message in India: utility ₹0.115 plus 18% GST at the time of writing. Interakt adds its own plan fee. 200 clients × 3 reminders is roughly ₹70 + GST in Meta charges for the season.

## How it works for the CA

- **Excel stays the master list.** Settings → Connect your Excel file. CA Desk re-reads it every time it's opened on that computer and never writes to it. Rows matched on Client code. Removed rows are archived, not deleted.
- **Clients folder.** Settings → Connect Clients folder. Documents you tick are written into `<client folder>/<year folder>/<document name>`. The year-folder style (e.g. `AY 2026-27` or `FY 2025-26`) is learnt from existing folders.
- **Today.** Ranked list of who to nudge, who to call, and what's due. "Start nudging" opens WhatsApp one client at a time with the message written; you tap send and confirm.
- **Same phone number = one message.** A family handled by one person gets one combined reminder.
- **Add documents.** Drag files in (PC), upload (phone), or share from WhatsApp (installed app on Android). CA Desk suggests the client and document; you confirm.

## Browser support

| Feature | Chrome / Edge on PC | Android (installed) | iPhone / Safari |
|---|---|---|---|
| Everything on screen, reminders | Yes | Yes | Yes |
| Live Excel sync, folder filing | Yes | No | No |
| Share from WhatsApp into CA Desk | No | Yes | No |
| Upload files | Yes | Yes | Yes |

On devices without folder access, ticked files are downloaded (local mode) or wait in your account until the PC files them (signed in).

## Privacy

- Full PANs are never saved, only the last 4 characters. Full PANs are read from your Excel while the app is open, to match documents.
- Aadhaar numbers are never asked for.
- Documents are written straight to your folder. With sign-in on, files from the phone sit in a private bucket only until your PC files them, and are deleted after 7 days either way. Files that arrive on WhatsApp are deleted from the bucket once filed, or after 14 days if never filed.
- The Interakt key stays on the server. The browser never sees it, and only your user id can send messages.

## Known limits (V1)

- Matching by PAN needs a PDF with real text. Scans and photos are matched by the last nudged client and the file name.
- Password-protected PDFs (AIS, 26AS, bank statements) are saved as they are; their content isn't read.
- Due dates in Settings marked "not checked" come from secondary sources. Verify them.
- Tax audit and GST checklists are drafts: review them once.
- In tap-to-send mode the app cannot see WhatsApp, so it only knows a message was sent when you confirm it. With Interakt it gets real delivered and read ticks.
- WhatsApp template values cannot contain line breaks, so through Interakt the document list is one line separated by commas.
