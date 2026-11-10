# Zubair Hasan — Portfolio Website

A free, fast portfolio for **Zubair Hasan, AI Video Editor & Visual Creator (Karachi)**.
Plain HTML/CSS/JavaScript — no build step, no server, no monthly cost.

```
index.html            the website
assets/css/style.css  design
assets/js/main.js     projects grid, filters, video player, animations
content/projects.json YOUR PROJECTS (edited from /admin — starts empty)
content/site.json     your name, bio, email, socials, tools, skills
admin/                the "Add project" editor (Sveltia CMS)
uploads/              thumbnails you upload from the editor
```

## 1. Put it online for free (GitHub Pages) — one time, ~10 minutes

1. Make a free account at https://github.com (any email).
2. Create a **new public repository** named exactly `YOUR-USERNAME.github.io`
   (example: `zubairhasan.github.io`). Public is required for free GitHub Pages.
3. Upload every file in this folder to it (Add file → Upload files → drag everything in,
   including the hidden `.nojekyll` file) → Commit.
4. Repo **Settings → Pages** → Source: *Deploy from a branch* → Branch `main`, folder `/ (root)` → Save.
5. After ~1 minute the site is live at `https://YOUR-USERNAME.github.io/`.
6. Replace the placeholders (edit on GitHub, pencil icon):
   - `admin/config.yml` → `repo: GITHUB_USERNAME/REPO_NAME` → e.g. `repo: zubairhasan/zubairhasan.github.io`
   - `admin/config.yml` → `site_url` / `display_url` → your site link
   - `index.html` → every `https://SITE_URL/` → your site link (this makes WhatsApp/LinkedIn previews show the image)

## 2. Adding a project (every time)

1. Open `https://YOUR-SITE/admin/`
2. First time on a device: click **Sign In Using Access Token**. Make the token at
   GitHub → Settings → Developer settings → Fine-grained tokens → *Generate new token* →
   Repository access: *Only select repositories* → your site repo →
   Permissions: **Contents: Read and write** → Generate → copy → paste into the editor.
   The browser remembers it.
3. **My Website → 🎬 Projects → Add Project** → paste the video link, add a title,
   pick a category (optional: client, year, description, tags, thumbnail) → **Save**.
4. The website updates in about 1 minute.

Edit: click a project in the list. Reorder: ↑ ↓ arrows or drag. Delete: ✕ on the project.
Hide without deleting: tick "Hide from website".
Profile, bio, socials, LinkedIn link, tools, skills and a showreel link are under **👤 Profile, bio & contact**.

### Video links that work
- **YouTube** (normal, youtu.be, Shorts) — thumbnail is automatic. Use *Unlisted* to keep it off your channel.
- **Vimeo** (public or unlisted) — thumbnail automatic for public videos.
- **Google Drive** — Share → General access → *Anyone with the link*. Upload a thumbnail for best results.
- **Instagram Reels**, **TikTok**, or a direct `.mp4` link.
  Shorts / Reels / TikTok open in a vertical player automatically.

## Optional
- Own domain (e.g. zubairhasan.com, ~$10/yr): Settings → Pages → Custom domain.
- "Sign in with GitHub" button instead of a token: deploy the free
  [Sveltia CMS Authenticator](https://github.com/sveltia/sveltia-cms-auth) on Cloudflare Workers,
  then set `base_url` and `auth_methods: [oauth, token]` in `admin/config.yml`.
- Netlify also works (`netlify.toml` included), but its free plan allows only ~20 deploys a month
  (each Save in the editor = 1 deploy), so GitHub Pages is recommended.

## Preview locally
```
python3 -m http.server 8080   # then open http://localhost:8080
```
