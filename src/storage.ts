import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import type { History, Listing } from './types.js';

export function loadHistory(filePath: string): History {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as History;
  } catch {
    return { last_run: null, listings: {} };
  }
}

export function saveHistory(filePath: string, history: History): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf-8');
}

export function isFirstRun(history: History): boolean {
  return history.last_run === null;
}

export function findNewListings(scrapedListings: Listing[], history: History): Listing[] {
  return scrapedListings.filter(l => !(l.id in history.listings));
}

export function mergeHistory(history: History, allListings: Listing[]): void {
  const now = new Date().toISOString();
  for (const listing of allListings) {
    if (listing.id in history.listings) {
      history.listings[listing.id].last_seen = now;
    } else {
      history.listings[listing.id] = { first_seen: now, last_seen: now };
    }
  }
  history.last_run = now;
}

export function purgeOldListings(history: History): void {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [id, entry] of Object.entries(history.listings)) {
    if (new Date(entry.first_seen).getTime() < cutoff) {
      delete history.listings[id];
    }
  }
}
