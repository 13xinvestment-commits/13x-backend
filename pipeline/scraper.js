// pipeline/scraper.js
const fetch = require('node-fetch');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getTranscriptFromScreener(ticker) {
  try {
    const url = `https://www.screener.in/company/${ticker}/consolidated/`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; research-bot/1.0)' }
    });
    const html = await res.text();

    // Strip all HTML tags and scripts
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Try to find concall section first
    const idx = text.toLowerCase().indexOf('concall');
    if (idx !== -1) return text.slice(idx, idx + 6000);

    // Fallback: return first 5000 chars
    return text.slice(0, 5000);

  } catch (err) {
    console.error(`Scraper error for ${ticker}:`, err.message);
    return null;
  }
}

module.exports = { getTranscriptFromScreener, sleep };
