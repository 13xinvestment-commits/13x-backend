// pipeline/bse_scraper.js
const fetch = require('node-fetch');

const NSE_BASE = 'https://nsearchives.nseindia.com/corporate';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
};

async function getBSETranscriptUrl(bseCode) {
  if (!bseCode) return null;
  try {
    const today = new Date();
    const from  = new Date(today);
    from.setMonth(from.getMonth() - 4); // last 4 months

    const fmt = d => d.toISOString().split('T')[0].replace(/-/g,'');
    const url = `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?strCat=-1&strPrevDate=${fmt(from)}&strScrip=${bseCode}&strSearch=P&strToDate=${fmt(today)}&strType=C&subcategory=-1`;

    const res  = await fetch(url, { headers: HEADERS, timeout: 10000 });
    const data = await res.json();
    const announcements = data?.Table || [];

    const concall = announcements.find(a => {
      const headline = (a.NEWSSUB || a.headline || '').toLowerCase();
      return headline.includes('transcript') ||
             headline.includes('concall') ||
             headline.includes('conference call') ||
             headline.includes('analyst') ||
             headline.includes('investor meet');
    });

    if (!concall) return null;

    const attachName = concall.ATTACHMENTNAME || concall.attachmentname;
    if (!attachName) return null;

    return `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${attachName}`;
  } catch (err) {
    return null;
  }
}

async function getNSETranscriptUrl(ticker) {
  try {
    const agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const url = `https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=${encodeURIComponent(ticker)}`;
    
    // Fetch directly without cookie prerequisites since this endpoint does not require session cookies
    const apiRes = await fetch(url, {
      headers: {
        'User-Agent': agent,
        'Referer': 'https://www.nseindia.com/companies-listing/corporate-filings-announcements'
      },
      timeout: 12000
    });

    if (!apiRes.ok) return null;
    const announcements = await apiRes.json();
    
    // Find latest announcement mentioning "transcript"
    const transcriptAnn = announcements.find(a => {
      const txt = ((a.desc || '') + ' ' + (a.attchmntText || '')).toLowerCase();
      return txt.includes('transcript') && !txt.includes('schedule') && !txt.includes('intimation');
    });

    if (transcriptAnn && transcriptAnn.attchmntFile) {
      return transcriptAnn.attchmntFile;
    }
  } catch (err) {
    console.error(`[bse_scraper] NSE scraping error for ${ticker}:`, err.message);
  }
  return null;
}

/**
 * Gets the remote transcript PDF URL for a company from BSE or NSE.
 * @param {object} company - Company database record or ticker details
 * @returns {Promise<string|null>} - The PDF URL, or null if not found
 */
async function getTranscriptUrl(company) {
  if (company.bse_code || company.bseCode) {
    const bseUrl = await getBSETranscriptUrl(company.bse_code || company.bseCode);
    if (bseUrl) return bseUrl;
  }
  
  return await getNSETranscriptUrl(company.ticker);
}

module.exports = { getTranscriptUrl };
