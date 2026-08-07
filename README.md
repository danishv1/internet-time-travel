# Internet Time Travel 🕰️

A Chrome extension that makes your browser behave as if today were any past date you choose.

Pick a date. Browse that internet. Preferably May 10th, 2019.

![Home feed](store-screenshots/screenshot-1.png)

## What it does

- **Any website** → redirected to its [Wayback Machine](https://web.archive.org) snapshot from your chosen date. Fox News, blogs, newspapers — they all look like they did back then.
- **Google search** → quietly date-capped with Google's own custom-date-range filter (works on Web, Images, News).
- **YouTube** → stays live so videos play, but:
  - searches get a `before:` operator appended
  - home feed, sidebar suggestions, pause/end-screen walls, and comments only show content from before your date
  - upload dates are rewritten relative to your chosen "today" (a 2016 video shows "3 years ago" when you live in 2019)
  - near the cutoff, exact upload dates are fetched and cached so the labels are accurate
  - Shorts don't exist yet, so they're gone
  - a rebuilt home feed recommends what was actually fresh that year, seeded from your subscriptions
- **Hebrew and English** YouTube UIs are both supported, including YouTube's abbreviated units ("שע׳") and bidi text quirks.

## Install

From source (until the Web Store listing is live):

1. Clone this repo
2. Open `chrome://extensions`, enable **Developer mode**
3. **Load unpacked** → select the repo folder
4. Click the extension icon, pick a date, hit **🚀 Start time travel**

## Usage

- **🚀 Start time travel** — saves the date and warps the current tab (with an animation) into the past.
- **💾 Save** — saves the date without the drama.
- **Open \<site\> live** — exempts the current site (use for banking, email, anything that breaks inside the archive).
- **Always-live sites** — manage the exception list.

## How it works

| Piece | Mechanism |
|---|---|
| `background.js` | One `declarativeNetRequest` dynamic rule redirects top-level navigations to `web.archive.org/web/<date>/<url>` |
| `content-google.js` | Adds `tbs=cdr:1,cd_max:<date>` to Google search URLs at `document_start` |
| `content-youtube.js` | Rewrites searches, hides/rewrites dated elements via MutationObserver, fetches exact upload dates near the cutoff, injects the era-correct home feed |
| `popup.js` | Settings UI + the time-warp animation (injected via `chrome.scripting`) |

No build step, no dependencies, no data collection. Run the tests with `node test.js`.

## Known limitations

- URLs that didn't exist on your chosen date may land on a later archive capture (fix would be a CDX API lookup).
- YouTube's recommendations are server-side — the extension filters and augments, it can't reprogram the algorithm.
- Wayback Machine can be slow; some pages were never archived. Please be kind to archive.org — [donate to them](https://archive.org/donate), they are the actual time machine.
- YouTube's DOM changes regularly; selectors will need occasional maintenance.

## License

[MIT](LICENSE)
