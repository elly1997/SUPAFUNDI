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

5. **Supabase** — Authentication → URL configuration: set **Site URL** and redirect URLs to your Netlify domain.

After deploy, the build log should show `publish: /opt/build/repo/.next` and `publishOrigin: config` (not `ui` with repo root).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on port 3000 |
| `npm run dev:clean` | Kill stale dev ports, delete `.next`, start dev |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
"# SUPAFUNDI" 
