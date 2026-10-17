# CA Desk — fixes and deployment notes

## Changes in this patch

- Improved email sign-in validation and recovery states.
- Prevented rapid duplicate clicks while a sign-in code is being sent or verified.
- Preserved the entered one-time code after a failed verification attempt.
- Added clearer in-app guidance to check Supabase Auth SMTP and Resend delivery logs.
- Updated the README with the correct Resend + Supabase Auth setup and corrected demo-storage wording.
- Kept `app.js` synchronized with the readable files under `src/`.

## Important: where Resend belongs

The current app uses Supabase Auth `signInWithOtp()` for sign-in emails. It does **not** call Resend directly from the frontend, and it does not currently have a Netlify email function. Configure Resend as Supabase Auth's custom SMTP server, or use the official Resend integration in Supabase. Do not put a Resend API key in `config.js` or browser code.

Manual SMTP values:

- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: your Resend API key
- Sender: an address on a verified Resend domain

Also enable custom SMTP in Supabase Auth, include `{{ .Token }}` in the Magic Link email template, and allow the deployed CA Desk URL in Auth URL Configuration.

## Deploy

Publish the contents of this `ca-desk-app` folder to the **existing** Netlify site using that site's Deploys page, or push the changes to the Git repository connected to Netlify. Do not upload this as a new site unless you intend to change the public URL.

After deployment, test in the live app:

1. Open Settings → Account and sync.
2. Request one sign-in code.
3. Check Resend → Logs and Supabase Auth logs for the same attempt.
4. Enter the code and verify that sign-in completes and sync succeeds.
5. Run the demo flow from the welcome screen without signing in; the demo should remain usable without email.

## Verification performed

- `node --check app.js` passed.
- `node --check` passed for all files under `src/`.
- Verified that `app.js` exactly equals the concatenation of all `src/*.js` files in filename order.
- A full browser interaction test could not be completed in this environment because the test browser blocked local navigation. The live Resend/SMTP delivery path still needs to be tested with your Supabase and Resend dashboards.
