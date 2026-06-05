// pipeline/bse_scraper.js
// Fetches concall transcript PDFs from NSE/BSE for Indian listed companies

const fetch = require('node-fetch');

const NSE_BASE = 'https://nsearchives.nseindia.com/corporate';
const BSE_BASE = 'https://api.bseindia.com/BseIndiaAPI/api';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch latest concall announcement from BSE for a given scrip code
 * Returns PDF URL if found, null otherwise
 */
async function getBSETranscriptUrl(bseCode) {
  try {
    const today = new Date();
    const from  = new Date(today);
    from.setMonth(from.getMonth() - 4); // last 4 months

    const fmt = d => d.toISOString().split('T')[0].replace(/-/g,'');
    const url = `https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?strCat=-1&strPrevDate=${fmt(from)}&strScrip=${bseCode}&strSearch=P&strToDate=${fmt(today)}&strType=C&subcategory=-1`;

    const res  = await fetch(url, { headers: HEADERS, timeout: 10000 });
    const data = await res.json();
    const announcements = data?.Table || [];

    // Find concall/transcript announcement
    const concall = announcements.find(a => {
      const headline = (a.NEWSSUB || a.headline || '').toLowerCase();
      return headline.includes('transcript') ||
             headline.includes('concall') ||
             headline.includes('conference call') ||
             headline.includes('analyst') ||
             headline.includes('investor meet');
    });

    if (!concall) return null;

    // Build PDF URL
    const attachName = concall.ATTACHMENTNAME || concall.attachmentname;
    if (!attachName) return null;

    return `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${attachName}`;
  } catch (err) {
    return null;
  }
}

/**
 * Extract text from a PDF URL
 * Uses BSE/NSE direct PDF download
 */
async function extractTextFromPDF(pdfUrl) {
  try {
    const res = await fetch(pdfUrl, {
      headers: {
        ...HEADERS,
        'Accept': 'application/pdf,*/*',
      },
      timeout: 15000,
    });

    if (!res.ok) return null;

    const buffer = await res.buffer();

    // Simple PDF text extraction — find readable ASCII text between PDF markers
    const raw = buffer.toString('latin1');
    const textChunks = [];
    const regex = /\(([^\)]{10,})\)/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      const chunk = match[1].replace(/[^\x20-\x7E\n]/g, ' ').trim();
      if (chunk.length > 10) textChunks.push(chunk);
    }

    const text = textChunks.join(' ').replace(/\s+/g, ' ').trim();
    return text.length > 200 ? text.slice(0, 6000) : null;

  } catch (err) {
    return null;
  }
}

/**
 * Main function — get transcript text for a company
 * Tries BSE first, falls back to NSE
 */
async function getTranscript(company) {
  // Try BSE if bseCode provided
  if (company.bseCode) {
    const pdfUrl = await getBSETranscriptUrl(company.bseCode);
    if (pdfUrl) {
      const text = await extractTextFromPDF(pdfUrl);
      if (text) {
        console.log(`  📄 Found BSE transcript for ${company.name}`);
        return text;
      }
    }
  }

  // Try NSE archive search
  try {
    const url = `https://www.nseindia.com/api/corp-info?symbol=${company.ticker}&corpType=concall`;
    const res  = await fetch(url, { headers: HEADERS, timeout: 10000 });
    const data = await res.json();
    const files = data?.data || [];

    if (files.length > 0) {
      const latest  = files[0];
      const pdfUrl  = `${NSE_BASE}/${latest.fileName}`;
      const text    = await extractTextFromPDF(pdfUrl);
      if (text) {
        console.log(`  📄 Found NSE transcript for ${company.name}`);
        return text;
      }
    }
  } catch { /* silent */ }

  return null;
}

module.exports = { getTranscript, sleep };
