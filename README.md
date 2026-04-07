# Carousell Monitoring Bot

Automatically monitors Carousell (Singapore) for new listings matching your search queries and sends a batched Telegram alert when new ones appear. Runs on a GitHub Actions cron schedule every 6 hours.

## Motivation

Carousell doesn't have email/push alerts for saved searches. If you're watching for something specific — a Mac Mini M4 at a good price, a particular keyboard — you either refresh manually or miss deals. This bot does the checking for you and only pings you when something new and relevant shows up.

## How it works

1. **Scrapes** Carousell search results using Puppeteer (headless Chrome with stealth mode)
2. **Scores** each listing for relevance and price match
3. **Diffs** against stored history — only new listings trigger a notification
4. **Notifies** via Telegram with a single batched message, sorted by score
5. **Persists** history back to the repo; listings older than 7 days are purged automatically

On the first run, a baseline is saved with no alert sent — subsequent runs diff against it.

## Setup

### 1. Create a Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram → `/newbot`
2. Copy the bot token it gives you
3. Start a chat with your bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your `chat_id`

### 2. Add GitHub Actions secrets

In your repo: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | The token from BotFather |
| `TELEGRAM_CHAT_ID` | Your chat ID |

### 3. Enable Actions write permissions

**Settings → Actions → General → Workflow permissions** → select **Read and write permissions**

This allows the workflow to commit the updated history file back to the repo.

### 4. Configure your searches

Edit `src/config.ts`:

```ts
searches: [
  {
    query: "mac mini m4",              // submitted to Carousell search
    relevantKeywords: ["m4", "24gb"],  // boosts relevance score if found in title
    irrelevantKeywords: ["m1", "m2"],  // immediately disqualifies listing if found
    idealPrice: 900,                   // SGD; used for price match scoring
  },
]
```

| Field | Required | Description |
|---|---|---|
| `query` | Yes | Search string sent to Carousell |
| `relevantKeywords` | No | Keywords that increase relevance score. If omitted, query tokens are used |
| `irrelevantKeywords` | No | Any match → listing is discarded (score = 0) |
| `idealPrice` | No | Target price in SGD. Omit to skip price scoring |

## Scoring

Each listing receives three scores (0–1):

- **Relevance** — fraction of `relevantKeywords` found in the listing title. If any `irrelevantKeyword` matches, score is immediately 0.
- **Price match** — `1 - |price - idealPrice| / idealPrice`. Exact match = 1.0, at 2× ideal = 0.0. Null if no `idealPrice` set.
- **Combined** — `0.7 × relevance + 0.3 × price` (or just relevance if no price configured)

Listings with relevance below 0.3 are dropped. New listings are sorted by combined score descending in the Telegram message.

## Telegram message format

```
🛒 2 new listing(s) found on Carousell

1. Mac Mini M4 24GB 256GB Space Grey
   💰 SGD 850 · Like New
   👤 johndoe88
   🔍 Search: "mac mini m4"
   ⭐ Relevance: 80% · Price match: 94% · Score: 84%
   🔗 View listing

2. ...
```

## Running locally

```bash
npm install
TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=yyy npx tsx src/index.ts
```

The first run saves a baseline and sends no notification. Delete or clear `data/listings-history.json` to reset.

## Project structure

```
src/
  config.ts      — search queries and settings
  types.ts       — TypeScript interfaces
  scraper.ts     — Puppeteer scraping logic
  detector.ts    — relevance & price scoring
  storage.ts     — history file I/O
  notifier.ts    — Telegram notifications
  index.ts       — main entry point
data/
  listings-history.json   — persisted listing history (committed by CI)
.github/workflows/
  scrape.yml     — GitHub Actions cron job
```
