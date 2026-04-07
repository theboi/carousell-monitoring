import type { RawListing, Listing, SearchConfig } from './types.js';

const STOP_WORDS = new Set(['a', 'an', 'the', 'for', 'of']);
const MIN_RELEVANCE = 0.3;

export function scoreListing(listing: RawListing, search: SearchConfig): Listing {
  const titleLower = listing.title.toLowerCase();

  // Irrelevant keyword check — runs first, immediate disqualification
  if (search.irrelevantKeywords && search.irrelevantKeywords.length > 0) {
    for (const kw of search.irrelevantKeywords) {
      if (titleLower.includes(kw.toLowerCase())) {
        return { ...listing, relevance_score: 0, price_score: null, combined_score: 0 };
      }
    }
  }

  // Determine positive keyword list
  let keywords: string[];
  if (search.relevantKeywords && search.relevantKeywords.length > 0) {
    keywords = search.relevantKeywords.map(k => k.toLowerCase());
  } else {
    keywords = search.query
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 0 && !STOP_WORDS.has(t));
  }

  // Relevance score
  let relevance_score: number;
  if (keywords.length === 0) {
    relevance_score = 1;
  } else {
    const matched = keywords.filter(kw => titleLower.includes(kw)).length;
    relevance_score = matched / keywords.length;
    if (matched === keywords.length) relevance_score = 1.0; // boost to 1 when all match
  }

  // Price score
  let price_score: number | null = null;
  if (search.idealPrice != null && listing.price != null) {
    price_score = Math.max(0, 1 - Math.abs(listing.price - search.idealPrice) / search.idealPrice);
  }

  // Combined score
  const combined_score = price_score == null
    ? relevance_score
    : 0.7 * relevance_score + 0.3 * price_score;

  return { ...listing, relevance_score, price_score, combined_score };
}

export function filterAndScore(listings: RawListing[], search: SearchConfig): Listing[] {
  return listings
    .map(l => scoreListing(l, search))
    .filter(l => l.relevance_score >= MIN_RELEVANCE)
    .sort((a, b) => b.combined_score - a.combined_score);
}
