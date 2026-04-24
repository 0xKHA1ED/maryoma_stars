# Maryoma Stars

Maryoma Stars is a static mobile-first web app for tracking one thing only: whether you worked on a given day. Everything else in the UI is derived from that single set of worked dates.

This repo is plain HTML, CSS, and JavaScript. There is no build step required for deployment, which makes it a good fit for GitHub Pages.

## What This README Covers

- local preview
- GitHub Pages deployment
- Supabase project setup
- Supabase Auth magic-link setup
- database and RLS setup
- connecting the app to Supabase
- common troubleshooting

## Repo Structure

- `index.html`: app shell
- `app.js`: main app logic
- `styles.css`: UI styles
- `config.js`: public runtime config for Supabase
- `supabase/worked_days.sql`: table and RLS policies
- `service-worker.js`: offline caching
- `manifest.webmanifest`: PWA manifest

## Important Security Note

This app runs entirely in the browser.

- It is safe to expose a Supabase public client key in `config.js`.
- Use a `sb_publishable_...` key if available.
- A legacy `anon` key also works.
- Never put a `service_role` or secret key in this repo or in the browser.

Supabase’s API key docs explain that publishable and `anon` keys are safe for public client-side apps, while secret and `service_role` keys are not.

## 1. Local Preview

Do not open `index.html` directly with `file://`. The app uses ES modules and a service worker, so it should be served over HTTP.

From the repo root:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/
```

You can also use:

```text
http://localhost:4173/
```

If you plan to test Supabase magic links locally, add whichever local URL you use to Supabase Auth redirect settings.

## 2. Create a Supabase Project

1. Create a new project in Supabase.
2. Wait for the database to finish provisioning.
3. Open the project dashboard.
4. Get your project URL and public client key.

You can usually find these in the project’s Connect dialog or in the API keys section of Project Settings.

For this app you need:

- `Project URL`
- public client key
  This can be a modern `sb_publishable_...` key or a legacy `anon` key.

## 3. Create the Database Table and Policies

This repo already includes the SQL you need in:

- [`supabase/worked_days.sql`](./supabase/worked_days.sql)

In Supabase:

1. Open `SQL Editor`.
2. Paste the contents of `supabase/worked_days.sql`.
3. Run the script.

That script creates:

- `public.worked_days`
- a composite primary key on `(user_id, worked_on)`
- Row Level Security
- policies so users can only read/write their own rows

The key rule enforced by the table is:

- one user can only have one row per calendar day

## 4. Configure Supabase Auth for Magic Links

This app signs users in by calling `supabase.auth.signInWithOtp(...)` and passing `emailRedirectTo`.

Because of that, your redirect URLs must be configured correctly in Supabase Auth.

### Enable Email Auth

Supabase email authentication and Magic Links are enabled by default, but you should still verify that email auth is available in your project.

### Set URL Configuration

In Supabase, go to the Auth URL configuration area and set:

- `Site URL`
- `Additional Redirect URLs`

For a GitHub Pages project site, the production URL usually looks like this:

```text
https://<github-username>.github.io/<repo-name>/
```

For this repo, if the repository name stays the same, that would usually be:

```text
https://<github-username>.github.io/maryoma_stars-main/
```

Recommended values:

- `Site URL`
  `https://<github-username>.github.io/maryoma_stars-main/`
- `Additional Redirect URLs`
  `http://127.0.0.1:4173/`
  `http://localhost:4173/`
  `https://<github-username>.github.io/maryoma_stars-main/`

If you add a custom domain later, also add that exact URL with the trailing slash.

### Trailing Slash Matters

This app builds the redirect target from:

```js
window.location.origin + window.location.pathname
```

So for GitHub Pages project sites, the redirect should match the deployed page path exactly, including the repo name and trailing slash.

Examples:

- correct:
  `https://yourname.github.io/maryoma_stars-main/`
- wrong:
  `https://yourname.github.io/`
- wrong:
  `https://yourname.github.io/maryoma_stars-main`

## 5. Add Supabase Config to the App

Edit:

- [`config.js`](./config.js)

Replace the empty values:

```js
window.__MARYOMA_CONFIG__ = window.__MARYOMA_CONFIG__ || {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_PUBLIC_KEY",
  defaultEmail: "you@example.com",
  timeZone: "",
};
```

Notes:

- `supabaseAnonKey` is just the existing config field name.
- It can hold a modern publishable key or a legacy anon key.
- `defaultEmail` is optional but convenient because it prefills the settings sheet.
- `timeZone` is optional. If left empty, the app falls back to the browser timezone.

If you prefer, you can leave `config.js` blank and enter the values in the app’s Settings screen after deployment, but baking the public values into `config.js` is more convenient for a single-user GitHub Pages app.

## 6. Deploy to GitHub Pages

Because this repo is already static, the simplest deployment path is:

- push the repo to GitHub
- deploy directly from a branch

### Option A: Deploy From a Branch

1. Push this repo to GitHub.
2. Open the repository on GitHub.
3. Go to `Settings`.
4. Open `Pages`.
5. Under `Build and deployment`, set `Source` to `Deploy from a branch`.
6. Choose your branch, usually `main`.
7. Choose the folder `/(root)`.
8. Save.

GitHub Pages should publish the site automatically.

Typical URLs:

- user/organization site:
  `https://<username>.github.io/`
- project site:
  `https://<username>.github.io/<repo-name>/`

For this repository, you will usually get:

```text
https://<github-username>.github.io/maryoma_stars-main/
```

### Option B: Use a Custom GitHub Actions Workflow

You do not need this for the current repo, since there is no build step.

If you later add a build process, GitHub Pages also supports deployment through custom Actions workflows.

## 7. First Production Test

After GitHub Pages is live:

1. Open the deployed URL.
2. Open Settings.
3. Confirm the Supabase URL and public key are present.
4. Enter your email if it is not prefilled.
5. Tap `Send Magic Link`.
6. Open the email and click the link.
7. Confirm the app returns to the deployed GitHub Pages URL.
8. Claim a star.
9. Refresh the page and confirm the date is still there.

If this works, your full stack is connected correctly.

## 8. How Sync Works in This App

This app is local-first.

- worked dates are cached in local storage
- the UI renders from local data immediately
- Supabase sync happens in the background
- duplicate same-day claims are prevented locally and by the database primary key

That means:

- the app still works offline
- queued claims sync once the user is signed in and back online

## 9. Updating the Live Site

For future updates:

1. edit the files locally
2. commit
3. push to the Pages source branch
4. wait for GitHub Pages to redeploy

If the service worker makes the app seem stale after a deploy:

- refresh once or twice
- or hard refresh the page
- or unregister the service worker from the browser devtools during debugging

## 10. Troubleshooting

### Magic link sends, but login does not complete

Usually one of these is wrong:

- `Site URL` in Supabase Auth
- `Additional Redirect URLs`
- missing trailing slash
- using `localhost` when only `127.0.0.1` is allowed
- using the repo root URL instead of the project-site URL

For this app, the redirect URL must match the current page URL exactly.

### The app stays in local mode

Check:

- `config.js` is filled in
- the values were committed and deployed
- you used a public key, not a secret key
- the browser console does not show a failed request to Supabase

### Database requests fail with permission errors

Check:

- the SQL in `supabase/worked_days.sql` was run
- RLS is enabled
- the table is in `public`
- the signed-in user exists

### I clicked the magic link and landed on the wrong page

Re-check Supabase Auth URL configuration:

- `Site URL`
- `Additional Redirect URLs`

Supabase recommends exact production URLs for production instead of broad wildcard patterns.

### My GitHub Pages site loaded, but updates are not showing

Check:

- the correct branch is selected in `Settings > Pages`
- the correct folder is `/(root)`
- the latest commit reached GitHub
- the Pages deployment finished successfully

## 11. Custom Domain Notes

If you later attach a custom domain to GitHub Pages:

1. add the custom domain in GitHub Pages settings
2. verify DNS
3. update Supabase Auth URL configuration
4. set the custom domain as the production `Site URL`
5. keep your old GitHub Pages URL in `Additional Redirect URLs` if you still test with it

## 12. Recommended Production Checklist

- GitHub Pages is live
- `config.js` contains the correct project URL and public key
- `worked_days` table exists
- RLS is enabled
- policies were created
- Supabase Auth redirect URLs are configured
- magic link works on both localhost and production
- claiming a day survives refresh
- same-day duplicate claims are blocked

## Official Docs

These were the main references used for the deployment guidance in this README:

- GitHub Pages publishing source:
  https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- GitHub Pages custom workflows:
  https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- Supabase passwordless email / magic links:
  https://supabase.com/docs/guides/auth/auth-email-passwordless
- Supabase redirect URLs:
  https://supabase.com/docs/guides/auth/redirect-urls
- Supabase Row Level Security:
  https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase API keys:
  https://supabase.com/docs/guides/api/api-keys
