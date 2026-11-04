# Margie A. Marquez — Web Portfolio

Personal portfolio of Margie A. Marquez, 3rd-year IT student at City College of Calamba.

**Live site:** https://margie-marquez.vercel.app (Vercel, HTTPS)

Plain HTML, CSS and JavaScript, no build step and no framework, plus two small Vercel functions for the visitor counts.

| File | What it is |
| --- | --- |
| `index.html` | All page content: home, about, skills, projects, experience, education, CV, contact, site analytics |
| `style.css` | All styles: glass design, light/dark, phone/tablet/desktop layouts |
| `script.js` | Everything that moves: intro, backgrounds, clean URLs, project search and details, contact form, analytics |
| `api/hit.js`, `api/stats.js` | Vercel functions that count visits and return the totals (`api/_store.js` is shared by both) |
| `assets/` | Images (WebP), the CV and the NC II certificate |
| `vercel.json` | Hosting setup: clean URLs, caching and security headers |
| `.vercelignore` | Files kept off the public site |
| `robots.txt`, `sitemap.xml` | For search engines |
| `firebase.json`, `.firebaserc` | The older Firebase Hosting setup (margie-marquez.web.app), kept as a backup |

## Pages (clean URLs)

`/`, `/about`, `/skills`, `/projects`, `/projects/<project-id>`, `/experience`, `/education`, `/cv`, `/contact`, `/analytics`

They are all the same `index.html`: `vercel.json` serves it for these addresses, and `script.js` scrolls to the section or opens the project.

## Run it on your computer

Use any local web server from this folder, for example:

```bash
npx serve -s .
```

Then open the address it prints. The visit counts only work on Vercel (or with `npx vercel dev`); locally the Site analytics section says the numbers aren't available, and visits on localhost are never counted.

## Deploy (Vercel)

**First time:**

1. Push this folder to GitHub (the repository `Dhel-mm/portfolio`).
2. Sign up at https://vercel.com with **Continue with GitHub**.
3. Click **Add New… > Project**, pick `Dhel-mm/portfolio`, and click **Import**.
4. Project name: `margie-marquez` (this gives the address `margie-marquez.vercel.app`). Framework preset: **Other**. Leave the build and output settings empty, and click **Deploy**.
5. Turn on the visitor counts' storage: open the project > **Storage** > **Create Database** > **Upstash for Redis** (free plan) > **Create**, and connect it to the project. Vercel adds its address and key to the project as environment variables, so they are never in the code.
6. Open **Deployments** and **Redeploy** the latest one, so the functions see the storage.
7. Run the checklist below.

**After that:** every `git push` to `main` deploys automatically. (Or, without GitHub: `npm install -g vercel`, then `vercel --prod` from this folder.)

If Vercel gives the project a different address, put it in `index.html` (canonical and `og:` tags), `sitemap.xml` and `robots.txt`. To use a custom domain, open the project > **Settings > Domains**, add it, and add the DNS records Vercel shows at your domain registrar. Vercel turns on HTTPS by itself.

### After deploying, check

- The site opens over `https://`, and `/about`, `/projects/booksheaven` and the other pages load directly.
- Download CV and View CV online work.
- A test message from the contact form arrives (see below).
- Search, filters, dark mode and the background picker work on a phone and a desktop.
- The **Site analytics** section (`/analytics`) shows numbers, not "aren't available".
- No errors in the browser console.
- `/sitemap.xml` opens, and `/README.md` does **not**.

## Update the content

- **Projects:** edit the `projects` list at the top of `script.js` (section 1). Put the image in `assets/images/projects/` (WebP, about 1400px wide), then add `https://margie-marquez.vercel.app/projects/<id>` to `sitemap.xml`.
- **CV:** replace `assets/cv/Margie-Marquez-CV.pdf`, keeping the same name.
- **Everything else** (about, skills, experience, education, contact) is in `index.html`.

## Contact form

Messages are delivered by [FormSubmit](https://formsubmit.co) (free, no account). The first message ever sent makes FormSubmit email Margie an **Activate Form** link. Click it, and every later message goes straight to the inbox. FormSubmit then offers a random alias: you can put it in `CONTACT_ENDPOINT` in `script.js` (section 7) so the email address isn't in the code. Spam protection: a hidden honeypot field, a too-fast check and a 30-second limit between messages. If FormSubmit can't be reached, the visitor's email app opens with the message instead.

## Analytics

The portfolio counts and shows its own visits, in the **Site analytics** section (`/analytics`, linked in the footer): page views, CV downloads and views, messages sent, the most viewed projects, the most opened pages, and visitors' devices (phone, tablet, desktop).

- `script.js` (section 9) sends each count to `/api/hit`: the page opened, or an event such as `cv-download`, `certificate-view`, `contact-sent`, `device-phone` or `outbound/github.com`.
- `api/hit.js` adds one to that count in the Redis storage. It only accepts this site's own pages and these events, ignores search-engine bots, and allows each visitor 30 counts a minute against floods.
- `api/stats.js` returns all counts; the section loads them when it scrolls into view. The answer is cached for a minute.
- No cookies and no personal data: nothing about the visitor is stored (their network address is only used, hashed, for the one-minute limit), so no cookie banner is needed.
- Visits from localhost are not counted.

## Security notes

- `index.html` has a Content-Security-Policy: only this site and the listed services can run scripts or load files. **If you edit the small start-up `<script>` in the `<head>`**, its `sha256-...` value in the policy must be updated, or the browser will block it. Get the new value with:

  ```bash
  node -e "const h=require('fs').readFileSync('index.html','utf8');console.log('sha256-'+require('crypto').createHash('sha256').update(h.match(/<script>([\s\S]*?)<\/script>/)[1]).digest('base64'))"
  ```

- If you add a new outside service (another font or script site), add it to the policy too.
- All page text from the project data is inserted as text, never as HTML, so it can't inject code.
- The storage key lives only in Vercel's environment variables. There are no API keys or passwords in this code: keep it that way, since the repository and site are public.
