export type RawListing = Omit<Listing, 'relevance_score' | 'price_score' | 'combined_score'>;

export interface SearchConfig {
  query: string;
  relevantKeywords?: string[];
  irrelevantKeywords?: string[];
  idealPrice?: number;
}

export interface Listing {
  id: string;
  title: string;
  price: number | null;
  currency: string;
  seller: string;
  url: string;
  thumbnail_url: string;
  condition: string;
  posted_at: string | null;
  search_query: string;
  relevance_score: number;
  price_score: number | null;
  combined_score: number;
}

export interface HistoryEntry {
  first_seen: string;
  last_seen: string;
}

export interface History {
  last_run: string | null;
  listings: Record<string, HistoryEntry>;
}

export interface Config {
  searches: SearchConfig[];
  notification: {
    botToken: string | undefined;
    chatId: string | undefined;
  };
  scraper: {
    headless: boolean;
    timeout: number;
    useStealthPlugin: boolean;
    delayBetweenSearchesMs: [number, number];
  };
  storage: {
    path: string;
  };
}
