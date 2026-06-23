const supabase = require('../config/supabase');
const { getTranscriptUrl } = require('./bse_scraper');
const { extractTextFromPDF } = require('./pdf_extractor');
const { extractFinancialIntel } = require('./extractor');

const QUARTER = process.env.CURRENT_QUARTER || 'Q4FY26';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Runs the ingestion, extraction, and update pipeline for a single company by ticker.
 * @param {string} ticker - stock ticker of the company
 * @param {string} [pdfSource] - Optional URL or local path to a PDF transcript. If not provided, will scrape from BSE/NSE.
 * @returns {Promise<object>} - Pipeline execution metrics
 */
async function runPipelineForCompany(ticker, pdfSource = null) {
  const tSymbol = ticker.toUpperCase().trim();
  console.log(`\n⏳ [runner] Pipeline started for ${tSymbol} (${QUARTER})`);

  try {
    // 1. Fetch Company details from database
    const { data: company, error: coErr } = await supabase
      .from('companies')
      .select('id, name, ticker')
      .eq('ticker', tSymbol)
      .maybeSingle();

    if (coErr) throw coErr;
    if (!company) {
      throw new Error(`Company with ticker '${tSymbol}' does not exist in the database.`);
    }

    // 2. Fetch or Download Transcript PDF and extract text
    let sourcePath = pdfSource;
    if (!sourcePath) {
      console.log(`[runner] Scoping BSE/NSE announcements for ${company.name} (${tSymbol})...`);
      sourcePath = await getTranscriptUrl(company);
    }

    if (!sourcePath) {
      throw new Error(`No transcript PDF found on BSE/NSE for ${tSymbol}.`);
    }

    console.log(`[runner] Processing transcript from: ${sourcePath}`);
    const text = await extractTextFromPDF(sourcePath);
    if (!text || text.length < 200) {
      throw new Error(`Extracted text is empty or too short (${text ? text.length : 0} chars).`);
    }
    console.log(`[runner] Extracted ${text.length} characters of raw text.`);

    // 3. Extract Intel using Gemini
    console.log(`[runner] Running AI parsing using Gemini model...`);
    const intel = await extractFinancialIntel(text, company.name, QUARTER);
    console.log(`[runner] Gemini extraction successful!`);

    // 4. Update Supabase Database
    console.log(`[runner] Committing database updates for ${company.name}...`);

    // A. Update main company metadata
    const { error: companyUpdateErr } = await supabase
      .from('companies')
      .update({
        top_trigger: intel.company.top_trigger,
        catalyst_tags: intel.company.catalyst_tags,
        score: intel.company.score,
        stage: intel.company.stage,
        updated_at: new Date().toISOString()
      })
      .eq('id', company.id);

    if (companyUpdateErr) throw companyUpdateErr;
    console.log(`  ✓ Updated companies table header`);

    // B. Clear old entries for this quarter to prevent duplicates
    await supabase.from('triggers').delete().eq('company_id', company.id).eq('quarter', QUARTER);
    await supabase.from('signals').delete().eq('company_id', company.id).eq('quarter', QUARTER);
    await supabase.from('concall_snapshots').delete().eq('company_id', company.id).eq('quarter', QUARTER);
    console.log(`  ✓ Deleted any existing Q4FY26 triggers/signals/snapshots`);

    // C. Insert Triggers
    if (intel.triggers && intel.triggers.length > 0) {
      const triggersData = intel.triggers.map(t => ({
        company_id: company.id,
        quarter: QUARTER,
        trigger_text: t.trigger_text,
        catalyst_type: t.catalyst_type,
        conviction_score: t.conviction_score,
        source_quote: t.source_quote
      }));
      const { error: tErr } = await supabase.from('triggers').insert(triggersData);
      if (tErr) throw tErr;
      console.log(`  ✓ Inserted ${intel.triggers.length} triggers`);
    }

    // D. Insert Signals
    if (intel.signals && intel.signals.length > 0) {
      const signalsData = intel.signals.map(s => ({
        company_id: company.id,
        quarter: QUARTER,
        signal_type: s.signal_type,
        content: s.content,
        confidence: s.confidence,
        source: s.source
      }));
      const { error: sErr } = await supabase.from('signals').insert(signalsData);
      if (sErr) throw sErr;
      console.log(`  ✓ Inserted ${intel.signals.length} signals`);
    }

    // E. Insert Concall Snapshot
    if (intel.snapshot) {
      const { error: snapErr } = await supabase.from('concall_snapshots').insert({
        company_id: company.id,
        quarter: QUARTER,
        revenue_trend: intel.snapshot.revenue_trend,
        margin_trend: intel.snapshot.margin_trend,
        tone: intel.snapshot.tone,
        guidance_summary: intel.snapshot.guidance_summary,
        capex_commentary: intel.snapshot.capex_commentary,
        risks: intel.snapshot.risks,
        key_quotes: intel.snapshot.key_quotes, // JSON array
        created_at: new Date().toISOString()
      });
      if (snapErr) throw snapErr;
      console.log(`  ✓ Inserted concall snapshot`);
    }

    console.log(`✅ [runner] Pipeline complete for ${tSymbol}!`);
    return { success: true, ticker: tSymbol };

  } catch (err) {
    console.error(`❌ [runner] Pipeline failed for ${tSymbol}:`, err.message);
    return { success: false, ticker: tSymbol, error: err.message };
  }
}

/**
 * Runs the pipeline for all companies currently in the database.
 * @param {number} [limit] - Max number of companies to process (useful for development)
 */
async function runPipelineForAll(limit = null) {
  console.log(`\n🚀 Starting Bulk Pipeline Ingestion — Quarter: ${QUARTER}`);
  try {
    // 1. Get all companies
    const { data: companies, error } = await supabase
      .from('companies')
      .select('id, ticker');
    if (error) throw error;

    // 2. Get all companies that already have snapshots for this quarter
    const { data: processedSnaps, error: snapErr } = await supabase
      .from('concall_snapshots')
      .select('company_id')
      .eq('quarter', QUARTER);
    if (snapErr) throw snapErr;

    const processedIds = new Set(processedSnaps ? processedSnaps.map(s => s.company_id) : []);

    // 3. Filter to only keep unprocessed ones
    let targetCompanies = companies.filter(co => !processedIds.has(co.id));

    console.log(`📋 Found ${companies.length} total companies, ${processedIds.size} already processed.`);
    console.log(`🔍 Remaining unprocessed: ${targetCompanies.length}`);

    // 4. Apply limit to remaining unprocessed companies
    if (limit) {
      targetCompanies = targetCompanies.slice(0, limit);
      console.log(`👉 Processing the next ${targetCompanies.length} companies.`);
    }

    if (targetCompanies.length === 0) {
      console.log('🎉 All companies are already processed for this quarter!');
      return { success: 0, failed: 0, total: 0 };
    }

    let success = 0;
    let failed = 0;

    for (const co of targetCompanies) {
      const result = await runPipelineForCompany(co.ticker);
      if (result.success) success++; else failed++;
      // Wait 12 seconds to comply with rate limits (Groq RPM/TPM reset safety)
      await sleep(12000);
    }

    console.log(`\n🎉 Bulk Pipeline complete!`);
    console.log(`✅ Succeeded: ${success} | ❌ Failed: ${failed}`);
    return { success, failed, total: targetCompanies.length };
  } catch (err) {
    console.error(`[runner] Bulk run error:`, err.message);
    throw err;
  }
}

module.exports = {
  runPipelineForCompany,
  runPipelineForAll
};