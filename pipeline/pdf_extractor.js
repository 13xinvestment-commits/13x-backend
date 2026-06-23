const fs = require('fs');
const fetch = require('node-fetch');
const pdfParse = require('pdf-parse');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/pdf,*/*',
};

/**
 * Downloads a PDF from a URL or reads it from local filesystem, then extracts readable text.
 * @param {string} sourcePath - URL or local file path
 * @returns {Promise<string>} - The extracted text content
 */
async function extractTextFromPDF(sourcePath) {
  try {
    let buffer;
    if (sourcePath.startsWith('http://') || sourcePath.startsWith('https://')) {
      const res = await fetch(sourcePath, { headers: HEADERS, timeout: 15000 });
      if (!res.ok) {
        throw new Error(`Failed to download PDF: ${res.statusText}`);
      }
      buffer = await res.buffer();
    } else {
      buffer = fs.readFileSync(sourcePath);
    }

    const pdfData = await pdfParse(buffer);
    return pdfData.text || '';
  } catch (err) {
    console.error(`[pdf_extractor] Error extracting text from ${sourcePath}:`, err.message);
    throw err;
  }
}

module.exports = { extractTextFromPDF };
