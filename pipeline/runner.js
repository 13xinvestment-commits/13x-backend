// pipeline/runner.js
const supabase = require('../config/supabase');
const { getTranscriptFromScreener, sleep } = require('./scraper');
const { extractTriggers } = require('./extractor');

const QUARTER = process.env.CURRENT_QUARTER || 'Q4FY26';

// ─────────────────────────────────────────────────────────────────────────────
// YOUR COMPANY LIST
// Add all 2000+ companies here in the same format.
// ticker = Screener.in URL slug
// Example: screener.in/company/RELIANCE → ticker is "RELIANCE"
// ─────────────────────────────────────────────────────────────────────────────
const COMPANIES = [
  { ticker: 'RELIANCE',  name: 'Reliance Industries',  industry: 'Energy' },
  { ticker: 'TCS',       name: 'TCS',                  industry: 'IT Services' },
  { ticker: 'HDFCBANK',  name: 'HDFC Bank',             industry: 'Banking – Private' },
  { ticker: 'INFY',      name: 'Infosys',               industry: 'IT Services' },
  { ticker: 'WIPRO',     name: 'Wipro',                 industry: 'IT Services' },
  { ticker: 'HAL',       name: 'HAL',                   industry: 'Aerospace & Defence' },
  { ticker: 'SUNPHARMA', name: 'Sun Pharma',            industry: 'Pharma – CDMO' },
  { ticker: 'TATAMOTORS',name: 'Tata Motors',           industry: 'Auto' },
  { ticker: 'ADANIPORTS',name: 'Adani Ports',           industry: 'Infrastructure' },
  { ticker: 'BAJFINANCE', name: 'Bajaj Finance',        industry: 'Banking – Private' },
  // ── Keep adding your companies below this line ──────────────
];

async function upsertCompany(company, data) {
  if (!data) {
    console.log(`⚠️  No data extracted for ${company.name}`);
    return false;
  }

  const { error } = await supabase.from('companies').upsert({
    name:          company.name,
    ticker:        company.ticker,
    industry:      company.industry,
    top_trigger:   data.top_trigger,
    all_triggers:  data.all_triggers,
    catalyst_tags: data.catalyst_tags,
    score:         data.score,
    stage:         data.stage,
    quarter:       QUARTER,
    updated_at:    new Date().toISOString(),
  }, { onConflict: 'ticker' });

  if (error) {
    console.error(`❌ DB error for ${company.name}:`, error.message);
    return false;
  }

  console.log(`✅ Saved: ${company.name}`);
  return true;
}

async function runPipeline() {
  console.log(`\n🚀 Pipeline started — Quarter: ${QUARTER}`);
  console.log(`📋 Processing ${COMPANIES.length} companies...\n`);

  let success = 0;
  let failed  = 0;

  for (const company of COMPANIES) {
    console.log(`⏳ Fetching: ${company.name} (${company.ticker})`);

    const transcript = await getTranscriptFromScreener(company.ticker);
    if (!transcript) {
      console.log(`⚠️  No transcript found for ${company.ticker}`);
      failed++;
      continue;
    }

    const data = await extractTriggers(transcript, company.name);
    const saved = await upsertCompany(company, data);

    if (saved) success++; else failed++;

    // 3 second pause between companies — avoids overloading Screener.in
    await sleep(3000);
  }

  const summary = {
    quarter:     QUARTER,
    success,
    failed,
    total:       COMPANIES.length,
    completedAt: new Date().toISOString(),
  };

  console.log(`\n🎉 Pipeline complete!`);
  console.log(`✅ Success: ${success} | ❌ Failed: ${failed} | 📋 Total: ${COMPANIES.length}\n`);

  return summary;
}

module.exports = { runPipeline };
