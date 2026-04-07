import type { Listing } from './types.js';

const TG_LIMIT = 4096;

function formatListing(index: number, listing: Listing): string {
  const price = listing.price != null ? `SGD ${listing.price}` : 'Price N/A';
  const relevancePct = Math.round(listing.relevance_score * 100);
  const scorePct = Math.round(listing.combined_score * 100);
  const priceMatchLine = listing.price_score != null
    ? ` · Price match: ${Math.round(listing.price_score * 100)}%`
    : '';

  return [
    `${index}. <b>${escapeHtml(listing.title)}</b>`,
    `   💰 ${price} · ${escapeHtml(listing.condition)}`,
    `   👤 ${escapeHtml(listing.seller)}`,
    `   🔍 Search: "${escapeHtml(listing.search_query)}"`,
    `   ⭐ Relevance: ${relevancePct}%${priceMatchLine} · Score: ${scorePct}%`,
    `   🔗 <a href="${listing.url}">View listing</a>`,
  ].join('\n');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendMessage(botToken: string, chatId: string, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: false }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[notifier] Telegram error ${res.status}: ${body}`);
  }
}

export async function notify(listings: Listing[], botToken: string | undefined, chatId: string | undefined): Promise<void> {
  if (!botToken || !chatId) {
    console.warn('[notifier] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping notification');
    return;
  }

  const header = `🛒 <b>${listings.length} new listing(s) found on Carousell</b>\n`;
  const parts = listings.map((l, i) => formatListing(i + 1, l));

  // Build messages respecting the 4096 char limit
  const messages: string[] = [];
  let current = header;

  for (const part of parts) {
    const addition = '\n' + part;
    if ((current + addition).length > TG_LIMIT) {
      messages.push(current.trimEnd());
      current = part;
    } else {
      current += addition;
    }
  }
  if (current.trim()) messages.push(current.trimEnd());

  for (const msg of messages) {
    await sendMessage(botToken, chatId, msg);
  }
}
