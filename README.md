# SUPAFUNDI TRADERS — Hardware POS

Web POS and business management for hardware wholesale & retail (Tanzania). Built with Next.js 14, Supabase, and Tailwind.

## Local development

```bash
npm install
# Create .env.local with Supabase URL + anon + service role keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use `npm run dev:clean` if the dev server shows stale chunk errors.

## Deploy to Netlify

1. **Connect Git** (recommended) — Netlify → **Add new site** → **Import from Git** → select this repo. Do not rely on drag-and-drop zip deploys for Next.js.
2. **Build settings** — Netlify reads `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `.next` (set in repo; overrides a bad UI value)
3. **Clear wrong UI publish** (if deploy still fails):
   - **Site configuration** → **Build & deploy** → **Build settings** → **Edit**
   - **Publish directory**: leave **completely blank** or set to `.next` (never `.` or `/` or repo root)
   - Save → **Deploys** → **Clear cache and deploy site**
4. **Environment variables** (Site configuration → Environment variables):

   | Variable | Required |
   |----------|----------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Yes |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
   | `SUPABASE_SERVICE_ROLE_KEY` | Yes |
   | `NEXT_PUBLIC_APP_URL` | Yes — e.g. `https://your-site.netlify.app` |
   | `AT_API_KEY` | SMS — Africa's Talking API key |
   | `AT_USERNAME` | SMS — Africa's Talking app username |
   | `AT_SENDER_ID` | SMS — optional approved sender ID |
   | `AT_SANDBOX` | SMS — set `true` for sandbox testing |

5. **Supabase** — Authentication → URL configuration: set **Site URL** and redirect URLs to your Netlify domain.

After deploy, the build log should show `publish: /opt/build/repo/.next` and `publishOrigin: config` (not `ui` with repo root).

## SMS (Africa's Talking)

Credit balance reminders are built in. After adding API keys:

1. Copy `.env.example` → `.env.local` and fill `AT_API_KEY`, `AT_USERNAME`, and optional `AT_SENDER_ID`.
2. Apply migration `supabase/migrations/20260623120000_sms_messaging.sql` if not already run.
3. **Settings → General** — scroll to **SMS messaging**; status should show **Provider configured**.
4. Click **Send test SMS** with your mobile number to verify the connection.
5. **Customers → Credit** — use the message icon on a customer with balance, or **Remind all (SMS)** for bulk reminders.

Templates and cooldown days are editable in Settings. Only owners, managers, and accountants can send SMS.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on port 3000 |
| `npm run dev:clean` | Kill stale dev ports, delete `.next`, start dev |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
