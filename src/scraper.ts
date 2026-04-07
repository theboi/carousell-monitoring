import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser } from 'puppeteer';
import type { RawListing, SearchConfig } from './types.js';

puppeteer.use(StealthPlugin());

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function parseRelativeTime(str: string): string | null {
  str = str.trim().toLowerCase();
  if (str === 'just now') return new Date().toISOString();

  const match = str.match(/^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/);
  if (!match) return null;

  const amount = parseInt(match[1], 10);
  const unit = match[2];
  const unitMs: Record<string, number> = {
    second: 1000,
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
  };

  return new Date(Date.now() - amount * unitMs[unit]).toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function scrapeSearch(browser: Browser, search: SearchConfig, timeout: number): Promise<RawListing[]> {
  const page = await browser.newPage();
  try {
    page.setDefaultNavigationTimeout(timeout);
    await page.setViewport({ width: 1920, height: 1080 });

    const apiListings: RawListing[] = [];
    let apiDataCaptured = false;

    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('api.carousell.com') && !url.includes('/api-service/') && !url.includes('/api/')) return;
      try {
        const json = await response.json() as Record<string, unknown>;
        // Look for listing arrays in the response
        const extract = (obj: unknown): void => {
          if (!obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) {
            for (const item of obj) extract(item);
            return;
          }
          const o = obj as Record<string, unknown>;
          // Check if this object looks like a listing
          if (typeof o.id === 'string' && typeof o.title === 'string') {
            const priceVal = (o.price as Record<string, unknown> | undefined);
            const price = priceVal ? parseFloat(String(priceVal.amount ?? priceVal.value ?? '')) || null : null;
            const id = String(o.id);
            const url = `https://www.carousell.sg/p/${id}/`;
            const thumbnailSrc = (o.coverPhoto as Record<string, unknown> | undefined)?.url as string ||
                                 (o.photos as {url: string}[] | undefined)?.[0]?.url || '';
            const sellerObj = o.seller as Record<string, unknown> | undefined;
            const seller = String(sellerObj?.username ?? sellerObj?.name ?? '');
            const condition = String(o.condition ?? o.conditionType ?? '');
            const timeStr = String(o.postedAt ?? o.created ?? '');
            const posted_at = timeStr ? (isNaN(Date.parse(timeStr)) ? parseRelativeTime(timeStr) : new Date(timeStr).toISOString()) : null;

            apiListings.push({
              id,
              title: String(o.title),
              price,
              currency: 'SGD',
              seller,
              url,
              thumbnail_url: thumbnailSrc,
              condition,
              posted_at,
              search_query: search.query,
            });
            apiDataCaptured = true;
          }
          for (const v of Object.values(o)) extract(v);
        };
        extract(json);
      } catch {
        // Ignore non-JSON responses
      }
    });

    const searchUrl = `https://www.carousell.sg/search/?query=${encodeURIComponent(search.query)}&sort_by=3`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });

    try {
      await page.waitForNetworkIdle({ idleTime: 1500, timeout: 15000 });
    } catch {
      // Continue even if network doesn't fully idle
    }

    let listings: RawListing[] = [];

    if (apiDataCaptured && apiListings.length > 0) {
      listings = apiListings;
    } else {
      // DOM fallback
      listings = await page.evaluate((query: string) => {
        const results: Array<{
          id: string; title: string; price: number | null; currency: string;
          seller: string; url: string; thumbnail_url: string; condition: string;
          posted_at: string | null; search_query: string;
        }> = [];

        const anchors = document.querySelectorAll('a[href*="/p/"]');
        anchors.forEach(anchor => {
          const href = (anchor as HTMLAnchorElement).href;
          const idMatch = href.match(/\/p\/[^/]+-(\d{6,})\/?$/);
          if (!idMatch) return;
          const id = idMatch[1];
          if (results.some(r => r.id === id)) return;

          const titleEl = anchor.querySelector('h1, h2, h3, p[class*="title"], [class*="title"]');
          const title = titleEl?.textContent?.trim() ?? anchor.textContent?.trim() ?? '';
          if (!title) return;

          const allText = anchor.textContent ?? '';
          const priceMatch = allText.match(/\$\s*([\d,]+(?:\.\d+)?)/);
          const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;

          const imgEl = anchor.querySelector('img');
          const thumbnail_url = imgEl?.src ?? '';

          // Look for seller link /u/
          const sellerLink = anchor.querySelector('a[href*="/u/"]') ?? document.querySelector(`a[href*="/u/"]`);
          const sellerMatch = (sellerLink as HTMLAnchorElement | null)?.href.match(/\/u\/([^/]+)/);
          const seller = sellerMatch?.[1] ?? '';

          const conditionEl = anchor.querySelector('[class*="condition"], [class*="Condition"]');
          const condition = conditionEl?.textContent?.trim() ?? '';

          const timeEl = anchor.querySelector('time, [class*="time"], [class*="Time"]');
          const posted_at = timeEl?.getAttribute('datetime') ?? timeEl?.textContent?.trim() ?? null;

          results.push({ id, title, price, currency: 'SGD', seller, url: href, thumbnail_url, condition, posted_at, search_query: query });
        });

        return results;
      }, search.query);
    }

    // Age filter: drop listings older than 7 days
    const now = Date.now();
    return listings.filter(l => {
      if (!l.posted_at) return true; // keep if unparseable
      const ts = Date.parse(l.posted_at);
      if (isNaN(ts)) return true;
      return now - ts <= SEVEN_DAYS_MS;
    });
  } finally {
    await page.close();
  }
}

export async function scrapeAll(searches: SearchConfig[], options: {
  headless: boolean;
  timeout: number;
  useStealthPlugin: boolean;
  delayBetweenSearchesMs: [number, number];
}): Promise<Map<SearchConfig, RawListing[]>> {
  const browser = await puppeteer.launch({
    headless: options.headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const results = new Map<SearchConfig, RawListing[]>();

  try {
    for (let i = 0; i < searches.length; i++) {
      const search = searches[i];
      let attempt = 0;
      let listings: RawListing[] = [];

      while (attempt < 3) {
        try {
          listings = await scrapeSearch(browser, search, options.timeout);
          break;
        } catch (err) {
          attempt++;
          if (attempt >= 3) {
            console.error(`[scraper] Failed to scrape "${search.query}" after 3 attempts:`, err);
          } else {
            const backoff = Math.pow(2, attempt) * 1000;
            console.warn(`[scraper] Attempt ${attempt} failed for "${search.query}", retrying in ${backoff}ms...`);
            await sleep(backoff);
          }
        }
      }

      results.set(search, listings);
      console.log(`[scraper] "${search.query}" → ${listings.length} listings`);

      if (i < searches.length - 1) {
        const delay = randomBetween(options.delayBetweenSearchesMs[0], options.delayBetweenSearchesMs[1]);
        await sleep(delay);
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}
