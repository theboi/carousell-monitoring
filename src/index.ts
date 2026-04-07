import config from './config.js';
import { scrapeAll } from './scraper.js';
import { filterAndScore } from './detector.js';
import { loadHistory, saveHistory, isFirstRun, findNewListings, mergeHistory, purgeOldListings } from './storage.js';
import { notify } from './notifier.js';
import type { Listing } from './types.js';

async function main(): Promise<void> {
  console.log(`[main] Run started at ${new Date().toISOString()}`);

  const history = loadHistory(config.storage.path);

  // Scrape
  const rawBySearch = await scrapeAll(config.searches, config.scraper);

  // Score and filter each search
  const allScraped: Listing[] = [];
  for (const search of config.searches) {
    const raw = rawBySearch.get(search) ?? [];
    const scored = filterAndScore(raw, search);
    allScraped.push(...scored);
  }

  // Deduplicate by id (same listing may appear in multiple searches)
  const seen = new Set<string>();
  const deduped = allScraped.filter(l => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });

  // Find new listings
  const newListings = findNewListings(deduped, history)
    .sort((a, b) => b.combined_score - a.combined_score);

  if (isFirstRun(history)) {
    console.log(`[main] First run — saving baseline of ${deduped.length} listings, no alerts sent`);
  } else if (newListings.length > 0) {
    console.log(`[main] ${newListings.length} new listing(s) found — sending notification`);
    await notify(newListings, config.notification.botToken, config.notification.chatId);
  } else {
    console.log('[main] No new listings found');
  }

  mergeHistory(history, deduped);
  purgeOldListings(history);
  saveHistory(config.storage.path, history);

  console.log(`[main] Run complete at ${new Date().toISOString()}`);
}

main().catch(err => {
  console.error('[main] Fatal error:', err);
  process.exit(1);
});
