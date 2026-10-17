# CA Desk

A filing-season assistant for chartered accountants in India. It tracks which documents every client still owes, writes WhatsApp reminders, and files what comes back in the right client folder.

**All the code is in [`ca-desk-app/`](ca-desk-app/).** Start with [`ca-desk-app/README.md`](ca-desk-app/README.md) for what the app does, how to try the demo, and how to deploy it.

| Folder / file | What it is |
|---|---|
| `ca-desk-app/src/` | The app's source code, split by area (data, screens, demo, tour, events) |
| `ca-desk-app/app.js` | The same code combined into the single file the browser loads |
| `ca-desk-app/supabase/functions/` | Server functions for sending WhatsApp reminders and receiving replies through Interakt |
| `ca-desk-app/supabase-schema.sql` | Database setup |
| `ca-desk-app/lib/` | Bundled libraries for reading Excel and PDF files and for sign-in |
