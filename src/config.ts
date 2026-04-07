import type { Config } from './types.js';

const config: Config = {
  searches: [
    {
      query: "mac mini m4",
      relevantKeywords: ["m4", "m4 pro", "24gb", "32gb", "mac mini"],
      irrelevantKeywords: ["m1", "m2", "m3", "mac pro", "macbook"],
      idealPrice: 900,
    },
    {
      query: "used mechanical keyboard",
      relevantKeywords: ["mechanical", "tkl", "60%", "keychron", "cherry", "switches"],
      idealPrice: 100,
    },
    {
      query: "iPhone 13",
      relevantKeywords: ["iphone 13", "pro", "256gb", "512gb"],
      idealPrice: 600,
    },
  ],
  notification: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
  scraper: {
    headless: true,
    timeout: 30_000,
    useStealthPlugin: true,
    delayBetweenSearchesMs: [2000, 5000],
  },
  storage: {
    path: "./data/listings-history.json",
  },
};

export default config;
