# mrd — Meta Ray-Ban Display web apps

Two apps, both served from this directory (hello world at `/helloworld/`,
teleprompter at `/teleprompter/`, and a landing page at `/`):

- **Hello Display** ([helloworld/](helloworld/)) — starter app: live clock,
  Canvas 2D animation demo, D-pad/Neural Band navigation, toast, localStorage
  persistence.
- **Prompter** ([teleprompter/](teleprompter/)) — personal teleprompter with a
  speech library. `teleprompter/speech.txt` holds all your speeches: start each
  one with a `# Title` line (blank line = paragraph break; a file with no `#`
  headers is treated as a single speech). The home screen lists them with word
  count and estimated minutes; each speech remembers its own position, and
  editing one speech on disk resets only that speech after Reload. In the
  prompter: swipe down/up to scroll (1 row / 3 rows / full page per swipe,
  configurable), swipe right/left to resize text live without losing your
  place, progress bar, offline fallback to the last loaded file. Settings
  (text size, scroll step, line spacing, bold, swipe direction) persist on
  the glasses.

Plain HTML/CSS/JS — no framework, no build step.

## Hosting

### GitHub Pages (stable, always on — the default)

This repo deploys to **https://hendricks27.github.io/mrd/** via GitHub Pages
(landing page at `/`, hello world at `/helloworld/`, teleprompter at
`/teleprompter/`). The Mac can be off;
the glasses fetch from GitHub's CDN. Install on glasses by QR
(`qr-install.png` in each app folder encodes the
`fb-viewapp://web_app_deep_link?...` deep link) or manually via Meta AI app →
App connections → Web apps.

To update a speech from anywhere: edit `teleprompter/speech.txt` on
github.com (or the GitHub mobile app), commit, wait ~1 minute for Pages to
redeploy, then pick **Reload script** on the glasses. Note the repo is
public — anything in `speech.txt` is visible to anyone.

### Local Mac hosting (fast iteration during development)

```bash
cd ~/code/personal/mrd && python3 -m http.server 8317
```

```bash
cloudflared tunnel --url http://localhost:8317
```

The tunnel prints an `https://<random>.trycloudflare.com` URL (changes each
restart). Add it as a second web app entry on the glasses when actively
developing — file edits are live instantly, no commit needed.

Built against Meta's official [Web Apps path](https://wearables.developer.meta.com/docs/develop/webapps/)
(shipped in developer preview on May 14, 2026) and the conventions from
[facebookincubator/meta-wearables-webapp](https://github.com/facebookincubator/meta-wearables-webapp).

```
index.html            screens: home / canvas render demo / about
styles.css            dark additive-display theme + focus states
app.js                D-pad navigation, actions, clock, canvas loop
favicon.png           128x128 PNG (SVG favicons are not supported)
manifest.webmanifest  web app manifest
```

## 1. Test locally (no glasses needed)

```bash
python3 -m http.server 8080
```

Open <http://localhost:8080>. The viewport is a fixed 600×600 — that's the real
panel size. Keyboard simulates the Neural Band:

| Key | Neural Band gesture |
|---|---|
| Arrow keys | wrist swipes (D-pad focus movement) |
| Enter | index-finger pinch (select) |
| Escape | middle-finger pinch (back) |

There's also an official "Meta Ray-Ban Display Web App Simulator" Chrome extension
that recreates the 600×600 surface.

## 2. Get it on your glasses

Requirements: **Meta Ray-Ban Display glasses** (fw v125+) paired with the
**Meta AI app** (v272+). Publishing is still developer-preview-only, so this
goes on via Developer Mode:

1. **Enable Developer Mode** — Meta AI app → **Settings → App Info** → tap
   **App version** five times → toggle **Developer Mode**.
2. **Host the app on a public HTTPS URL** — any static host works (Vercel,
   Netlify, GitHub Pages, Cloudflare Pages). E.g. with Vercel:

   ```bash
   npx vercel --prod
   ```

   (Meta provides no hosting; a password-protected URL is how you share with
   testers during the preview.)
3. **Install on the glasses** — Meta AI app → **App connections → Web Apps** →
   add via the URL, or scan a QR code of it. The
   `<meta name="mrbd-web-app-capable" content="yes">` tag in `index.html` is what
   marks the page as glasses-compatible.

## 3. Display rules this app follows (keep them when you extend it)

- **Black (`#000000`) is transparent.** The display is an additive waveguide —
  black emits no light. Page background is pure black (see-through canvas);
  every visible surface (cards, header, nav) uses dark gray `#0a0a0f`–`#1a1a2e`.
- **600×600, `overflow: hidden`,** 8px safe margin (edge elements get clipped
  by rubberband animations).
- **No pointer.** Focus jumps between elements. Every interactive element needs
  `class="focusable"` (+ `tabindex="0"` if it isn't a button) and a visible
  focus ring.
- **Actions via `data-action`** attributes; `data-action="back"` for back buttons.
- **Battery discipline:** animation/timer loops start on screen enter and stop on
  screen leave (`onScreenEnter`/`onScreenLeave` in `app.js`). Min 14px text,
  system font stack, PNG or Unicode icons only (no SVG icon libs / icon fonts).
- Rendering options on the glasses WebView: DOM, Canvas 2D (the Render screen
  here), and WebGL.

Also available to web apps: IMU motion/orientation (W3C sensor events),
`navigator.geolocation` (phone GPS), `localStorage` (5MB), `fetch`/WebSocket.
Not available: camera, microphone, text input, notifications, SVG favicons.

## 4. Extend with Meta's official AI starter kit

Meta ships Claude Code skills for exactly this workflow (add screens, sensors,
APIs, deploy):

```bash
git clone https://github.com/facebookincubator/meta-wearables-webapp.git
cd meta-wearables-webapp && ./install-skills.sh claude
```

Then `/create-webapp`, `/add-ui`, `/add-device-sensors`, `/connect-api`,
`/test-on-device`, `/publish-to-vercel`. There's also an official docs MCP
server at `https://mcp.developer.meta.com/wearables` (no auth).

## 5. When you outgrow web apps: the native SDK path

The **Wearables Device Access Toolkit** (v0.8.0, June 2026 — developer preview)
is the deeper integration: your phone app (Kotlin/Swift) drives the glasses —
camera streaming, photo capture, audio, and a Display capability that pushes
FlexBox/Text/Button/Image/video UI to the HUD. Needs glasses fw **V127** +
Meta AI app **V272**, an Application ID + Client Token from the
[Wearables Developer Center](https://wearables.developer.meta.com/), and
`DAM_ENABLED` (Device Access Toolkit App Model) for display.

- Android: `com.meta.wearable:mwdat-{core,camera,display,mockdevice}:0.8.0`
  from GitHub Packages Maven ([repo](https://github.com/facebook/meta-wearables-dat-android) —
  needs a GitHub PAT with `read:packages`)
- iOS: SPM package [facebook/meta-wearables-dat-ios](https://github.com/facebook/meta-wearables-dat-ios)
  @ 0.8.0 (`MWDATCore`, `MWDATDisplay`, …)
- Start from the `samples/DisplayAccess` app in either repo.

## Current preview limits (July 2026)

- No public publishing/app store yet (GA promised for 2026; watch Connect,
  Sept 23–24). Sharing = release channels (~100 testers) or password-protected
  web app URLs.
- Neural Band raw EMG is not exposed — you get the fixed gesture set only.
- Mock Device Kit can't simulate display glasses yet; a display hello world
  needs real hardware.

## Docs

- Getting started: <https://wearables.developer.meta.com/docs/getting-started-toolkit>
- Web Apps: <https://wearables.developer.meta.com/docs/develop/webapps/>
- FAQ: <https://developers.meta.com/wearables/faq/>
- Announcement: <https://developers.meta.com/blog/build-for-display-glasses/>
