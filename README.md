# Video Automation Dashboard

A single-page dashboard for a 6-stage short-video workflow:
**Swipe → Script → Produce → Post → Analyze → Repurpose.**

- `index.html` is the whole UI (no build step, no dependencies). Host it on GitHub Pages.
- The **Produce** tab has a **Re-run** button. Connected to your repo, it starts a GitHub Actions workflow that renders a real 1080×1920 MP4 with ffmpeg. Not connected, it runs a simulation.
- All numbers on the other tabs are **sample data**. Replace them from `data/state.json` or by editing `DEFAULT` in `index.html`.

```
.
├── index.html                      # dashboard UI
├── data/state.json                 # optional overrides (handle, niche, any DEFAULT section)
├── pipeline.config.json            # video size, timing, font, voice provider
├── scripts/generate.mjs            # script → voice → visuals → edit → render
├── .github/workflows/generate-video.yml
└── output/                         # local render output (git-ignored)
```

---

## 1. Create the GitHub repo (step by step)

1. Unzip or copy this folder to your computer, e.g. `video-dashboard/`.
2. On GitHub, click **New repository**. Name it `video-dashboard`, keep it **Public** (GitHub Pages is free for public repos), and **do not** tick "Add a README" (you already have one).
3. In a terminal, inside the folder:

```bash
git init -b main
git add .
git commit -m "Initial dashboard"
git remote add origin https://github.com/<your-username>/video-dashboard.git
git push -u origin main
```

4. Turn on the website: repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `/ (root)` → Save**.
5. After about a minute the dashboard is live at `https://<your-username>.github.io/video-dashboard/`.

## 2. Run the video pipeline on GitHub

1. Open the repo's **Actions** tab. If it asks, click **I understand my workflows, enable them**.
2. Pick **generate-video → Run workflow**, enter a title and a script (one line per scene), and run it.
3. When it finishes, open the run and download the **video** artifact (`video.mp4`).

The workflow steps are named `Script`, `Voice`, `Visuals`, `Edit`, `Render`. The dashboard maps those names to the checklist on the Produce tab.

## 3. Trigger it from the dashboard

1. Create a **fine-grained personal access token**: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained. Limit it to **only this repository**, permission **Actions: Read and write** (and Metadata: Read, added automatically).
2. Open the dashboard → **Produce** tab → click the gear or **Webhook**. Enter owner, repo, branch (`main`) and the token. Save.
3. Click **Re-run**. The dashboard calls the workflow-dispatch API, finds the new run and shows live progress in the Render log.

> **Token safety.** The token is stored in your browser's localStorage and sent only to `api.github.com`. Anyone with access to your browser profile can read it, so use a repo-scoped token, set a short expiry, and don't save it on shared computers. For a team setup, put a small proxy (Cloudflare Worker, for example) in front of the GitHub API and keep the token there.

## 4. Make the video real

Edit `pipeline.config.json`:

| Key | What it does |
| --- | --- |
| `width` / `height` / `fps` | Output format. Default 1080×1920 at 30 fps (vertical). |
| `secondsPerWord`, `minSecondsPerLine` | How long each scene stays on screen. |
| `palette` | Gradient colours that scenes cycle through. |
| `voice.provider` | `none` (silent) or `openai`. |

For narration, set `"provider": "openai"` and add a repo secret named `OPENAI_API_KEY` (**Settings → Secrets and variables → Actions**). The OpenAI voice path is written but was **not tested** here; the silent path was.

Run it locally (needs Node 22+ and ffmpeg):

```bash
TOPIC="Test" SCRIPT=$'Stop giving out free trials.\nEvery free user costs real money.' node scripts/generate.mjs all
```

Ideas for the next iteration: swap the gradient scenes for Remotion or HTML-to-video templates, add stock footage per line, burn in word-by-word captions, and add a final workflow step that uploads to your social scheduler.

## 5. Customise the dashboard data

Create or edit `data/state.json`. Top-level keys replace the matching section of the built-in sample (it is a shallow merge, so provide a whole section when you override it). For example:

```json
{
  "handle": "@mybrand",
  "niche": "Study abroad",
  "script": {
    "title": "Why your visa got rejected",
    "duration": "0:45",
    "source": "From Research",
    "hook": "Your student visa was rejected for one boring reason.",
    "body": ["Most people never read the financial proof rules.", "Here is the checklist."],
    "comment": "Comment CHECKLIST and I'll send it.",
    "checks": ["Hook in the first 3 s", "One idea a line", "Ends on a comment", "Same words on screen"]
  }
}
```

`data/state.json` loads only over http(s) (GitHub Pages or a local server). Opening `index.html` straight from disk uses the built-in sample instead. To preview locally: `python3 -m http.server 8000`, then open `http://localhost:8000`.

Keyboard: `←` `→` change stage, `Space` toggles autoplay.

---

## Reverse engineering with REA (optional)

[`morluto/rea`](https://github.com/morluto/rea) is an MCP server and CLI that lets an AI agent analyse software: websites, JavaScript/Electron apps, HAR captures, APKs, binaries and more. It does **not** generate video. Here it is useful for one thing: **studying how a reference app or site behaves** (its pages, network calls, data shapes) so you can design your own data model and API.

Setup (needs Node.js 22+):

```bash
npx rea-agents setup        # registers the MCP server with Claude Code, Codex, Cursor, Gemini CLI
# restart your agent, then ask it, for example:
#   "Use REA to observe https://<site you are allowed to analyse> and summarise its API calls and page data model."
```

Or analyse a HAR file you exported from your browser's DevTools (Network tab → Save all as HAR), or an extracted JS bundle:

```bash
npx -y rea-agents@latest analyze-javascript-application /absolute/path/to/app --json
```

Use it only on software you own or are authorised to examine. Take the *learnings* (flow, endpoints, schema) rather than copying someone else's code, copy or branding. The dashboard here is an original implementation of the workflow.

---

## Troubleshooting

- **Re-run says `GitHub answered 404`**: owner/repo/branch typo, or the token isn't scoped to this repo.
- **`GitHub answered 403` or `422`**: token lacks *Actions: Read and write*, or the branch doesn't contain `generate-video.yml`.
- **Pages shows a 404**: wait a minute after enabling Pages, and check the branch/folder setting.
- **Text missing in the video**: the workflow installs `fonts-dejavu-core`. Locally, point `font` in `pipeline.config.json` to any `.ttf` on your machine.
