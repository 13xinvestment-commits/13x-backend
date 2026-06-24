require('dotenv').config();
const supabase = require('./config/supabase');
const XLSX = require('xlsx');

function cleanName(n) {
  return String(n || '')
    .toLowerCase()
    .replace(/limited|ltd|corp|corporation|incorporated|inc|company|co|&|and|\(|\)/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

const SPECIFIC_MAPPINGS = {
  'SPAL': 'S. P. Apparels Limited'
};

async function migrate() {
  console.log('🌱 Starting DB Update from Excel...');
  
  // 1. Fetch all DB companies
  const { data: dbCos, error: coErr } = await supabase.from('companies').select('*');
  if (coErr) throw coErr;
  console.log(`Loaded ${dbCos.length} companies from database.`);
  
  // 2. Load Excel File
  const path = 'c:/Users/MAYANK JAIN/Downloads/frontend/fy26_full_company_data.xlsx';
  const workbook = XLSX.readFile(path);
  
  // 3. Build Watchlist Set
  const watchlistSheet = workbook.Sheets['Red Flags & Watchlist'];
  const watchlistGrid = XLSX.utils.sheet_to_json(watchlistSheet, { header: 1 });
  const watchlistNames = [];
  watchlistGrid.slice(3).forEach(row => {
    if (row[0]) watchlistNames.push(cleanName(row[0]));
  });
  console.log(`Watchlist/Red flag companies in Excel: ${watchlistNames.length}`);
  
  // 4. Load Full Details Sheet
  const detailsSheet = workbook.Sheets['Full Details'];
  const detailsGrid = XLSX.utils.sheet_to_json(detailsSheet, { header: 1 });
  const headers = detailsGrid[2];
  const rows = detailsGrid.slice(3);
  console.log(`Total companies in Excel Full Details: ${rows.length}`);
  
  // Helper to find header index
  const hIdx = name => headers.indexOf(name);
  
  for (const row of rows) {
    const excelName = row[hIdx('Company')];
    if (!excelName) continue;
    
    const cleanedExcel = cleanName(excelName);
    
    // Check if watchlisted
    const isWatchlisted = watchlistNames.includes(cleanedExcel);
    
    // Match to DB company
    let dbCo = dbCos.find(c => {
      if (c.ticker === 'SPAL' && cleanedExcel.includes('spapparels')) return true;
      const cleanedDb = cleanName(c.name);
      return cleanedDb.includes(cleanedExcel) || cleanedExcel.includes(cleanedDb);
    });
    
    let companyId;
    let ticker;
    
    if (dbCo) {
      companyId = dbCo.id;
      ticker = dbCo.ticker;
      console.log(`\nMatched: "${excelName}" -> DB Ticker: ${ticker}`);
    } else {
      // Determine ticker for unmatched ones
      if (cleanedExcel.includes('avenuesai') || cleanedExcel.includes('infibeam')) {
        ticker = 'INFIBEAM';
      } else if (cleanedExcel.includes('aegis')) {
        ticker = 'AEGISLOG';
      } else {
        ticker = excelName.split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '');
      }
      
      console.log(`\nUnmatched! Creating new company: "${excelName}" with Ticker: ${ticker}...`);
      
      // Check if already created in database from previous runs
      const { data: existingCo, error: findErr } = await supabase
        .from('companies')
        .select('*')
        .eq('ticker', ticker)
        .maybeSingle();
        
      if (findErr) throw findErr;
      
      if (existingCo) {
        companyId = existingCo.id;
        console.log(`Found previously created new company in DB with id: ${companyId}`);
      } else {
        // Insert new company
        const { data: newCo, error: insErr } = await supabase
          .from('companies')
          .insert({
            name: excelName,
            ticker: ticker,
            industry: row[hIdx('Sector')] || 'Miscellaneous',
            is_sample: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();
          
        if (insErr) {
          console.error(`Error inserting company ${excelName}:`, insErr.message);
          continue;
        }
        companyId = newCo.id;
        console.log(`Inserted new company in DB with id: ${companyId}`);
      }
    }
    
    // Parse tags, score, stage
    const catalystTags = getCatalystTags(row, headers);
    const score = getTriggerScore(row, headers, isWatchlisted);
    const stage = getStage(row, headers);
    const topTrigger = row[hIdx('Growth Drivers')] ? String(row[hIdx('Growth Drivers')]).split(';')[0].trim() : 'Growth expansion and operational scale-up.';
    
    // Update company header info
    const { error: upErr } = await supabase
      .from('companies')
      .update({
        industry: row[hIdx('Sector')] || dbCo?.industry,
        top_trigger: topTrigger,
        catalyst_tags: catalystTags,
        score: score,
        stage: stage,
        is_sample: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', companyId);
      
    if (upErr) {
      console.error(`Error updating company headers for ${ticker}:`, upErr.message);
      continue;
    }
    console.log(`Updated company headers (Score: ${score}, Stage: ${stage}, Tags: ${catalystTags.join(', ')}).`);
    
    // Clean associated details
    await supabase.from('triggers').delete().eq('company_id', companyId);
    await supabase.from('signals').delete().eq('company_id', companyId);
    await supabase.from('concall_snapshots').delete().eq('company_id', companyId);
    
    // Seed triggers (split Growth Drivers by semicolon)
    const driversText = String(row[hIdx('Growth Drivers')] || '');
    const triggerTexts = driversText.split(/;|\b\d\.\s/).map(t => t.trim()).filter(t => t.length > 5);
    if (triggerTexts.length > 0) {
      const trigData = triggerTexts.map((text, idx) => ({
        company_id: companyId,
        quarter: 'Q4FY26',
        trigger_text: text,
        catalyst_type: getCatalystType(text),
        conviction_score: idx === 0 ? 5 : 4,
        source_quote: `Our key growth driver includes: ${text}`
      }));
      
      const { error: tErr } = await supabase.from('triggers').insert(trigData);
      if (tErr) console.error(`Error inserting triggers for ${ticker}:`, tErr.message);
      else console.log(`Seeded ${trigData.length} triggers.`);
    }
    
    // Seed signals
    const signals = [];
    
    // 1. Guidance signal
    const guidanceVal = row[hIdx('FY27 Guidance')];
    if (guidanceVal && String(guidanceVal).toLowerCase() !== 'n/a') {
      signals.push({
        company_id: companyId,
        quarter: 'Q4FY26',
        signal_type: 'guidance',
        content: String(guidanceVal),
        confidence: 4,
        source: 'Q4 FY26 Earnings Call'
      });
    }
    
    // 2. Capex signal
    const capexVal = row[hIdx('Capex Plans')];
    if (capexVal && String(capexVal).toLowerCase() !== 'n/a') {
      signals.push({
        company_id: companyId,
        quarter: 'Q4FY26',
        signal_type: 'capex',
        content: String(capexVal),
        confidence: 4,
        source: 'Q4 FY26 Press Release'
      });
    }
    
    // 3. Auditor/Risk signal
    const flagsVal = row[hIdx('Flags / Red Flags')];
    if (flagsVal && String(flagsVal).toLowerCase() !== 'n/a' && String(flagsVal).toLowerCase() !== 'no issues') {
      signals.push({
        company_id: companyId,
        quarter: 'Q4FY26',
        signal_type: 'risk',
        content: `Concern: ${String(flagsVal)}`,
        confidence: 4,
        source: 'Annual Audit Report'
      });
    }
    
    // 4. ROCE margin/efficiency signal
    const roceVal = row[hIdx('ROCE / ROIC')];
    if (roceVal && String(roceVal).toLowerCase() !== 'n/a') {
      signals.push({
        company_id: companyId,
        quarter: 'Q4FY26',
        signal_type: 'margin',
        content: `Return profile: ROCE / ROIC stands at ${String(roceVal)}`,
        confidence: 4,
        source: 'FY26 Financial Results'
      });
    }
    
    if (signals.length > 0) {
      const { error: sErr } = await supabase.from('signals').insert(signals);
      if (sErr) console.error(`Error inserting signals for ${ticker}:`, sErr.message);
      else console.log(`Seeded ${signals.length} signals.`);
    }
    
    // Seed Concall Snapshot
    const revYoY = String(row[hIdx('Revenue YoY')] || '');
    const ebitdaYoY = String(row[hIdx('EBITDA YoY')] || '');
    
    const revTrend = revYoY.includes('+') ? 'up' : revYoY.includes('-') ? 'down' : 'stable';
    const marginTrend = ebitdaYoY.includes('+') ? 'up' : ebitdaYoY.includes('-') ? 'down' : 'stable';
    const tone = (isWatchlisted || flagsVal && flagsVal.length > 5) ? 'cautious' : 'positive';
    
    const keyQuotes = [
      {
        text: `Our FY26 results show a revenue of ${row[hIdx('FY26 Revenue')]} ${row[hIdx('Revenue YoY')] !== 'N/A' ? `with YoY growth of ${row[hIdx('Revenue YoY')]}` : ''}. We are confident in our execution capabilities for FY27.`,
        speaker: 'Management Team',
        quarter: 'Q4FY26'
      }
    ];
    if (row[hIdx('Key Highlights')] && String(row[hIdx('Key Highlights')]).toLowerCase() !== 'n/a') {
      keyQuotes.push({
        text: String(row[hIdx('Key Highlights')]),
        speaker: 'Executive Board',
        quarter: 'Q4FY26'
      });
    }
    
    const { error: snapErr } = await supabase.from('concall_snapshots').insert({
      company_id: companyId,
      quarter: 'Q4FY26',
      revenue_trend: revTrend,
      margin_trend: marginTrend,
      tone: tone,
      guidance_summary: row[hIdx('FY27 Guidance')] || 'No specific guidance details provided.',
      capex_commentary: row[hIdx('Capex Plans')] || 'No specific capex plans detailed.',
      risks: row[hIdx('Risks & Concerns')] || 'General macro and industry dependencies.',
      key_quotes: keyQuotes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    
    if (snapErr) console.error(`Error inserting concall snapshot for ${ticker}:`, snapErr.message);
    else console.log(`Seeded concall snapshot.`);
  }
  
  console.log('\n🎉 DB Update from Excel completed successfully!');
}

function getCatalystTags(row, headers) {
  const drivers = String(row[headers.indexOf('Growth Drivers')] || '').toLowerCase();
  const capex = String(row[headers.indexOf('Capex Plans')] || '').toLowerCase();
  const sector = String(row[headers.indexOf('Sector')] || '').toLowerCase();
  const flags = String(row[headers.indexOf('Flags / Red Flags')] || '').toLowerCase();
  
  const tags = [];
  if (capex && capex !== 'n/a' && !capex.includes('no specific') && !capex.includes('no major')) {
    tags.push('capex');
  }
  if (drivers.includes('product') || drivers.includes('launch') || drivers.includes('introduce') || drivers.includes('testing')) {
    tags.push('new_products');
  }
  if (drivers.includes('export') || drivers.includes('global') || drivers.includes('geographic') || drivers.includes('overseas') || drivers.includes('regional')) {
    tags.push('geographic_expansion');
  }
  if (drivers.includes('margin') || drivers.includes('cost saving') || drivers.includes('integration') || drivers.includes('efficiency')) {
    tags.push('margin_expansion');
  }
  if (drivers.includes('leverage') || drivers.includes('scale') || drivers.includes('capacity') || drivers.includes('volume')) {
    tags.push('operating_leverage');
  }
  if (flags && flags !== 'n/a' && flags !== 'no issues') {
    tags.push('risk');
  }
  if (tags.length === 0) {
    tags.push('operating_leverage');
  }
  return tags;
}

function getTriggerScore(row, headers, isWatchlisted) {
  let score = 4;
  const flags = String(row[headers.indexOf('Flags / Red Flags')] || '').toLowerCase();
  const revYoY = String(row[headers.indexOf('Revenue YoY')] || '');
  const patYoY = String(row[headers.indexOf('PAT YoY')] || '');
  
  if (isWatchlisted) {
    score -= 1;
  }
  if (flags && flags !== 'n/a' && flags !== 'no issues' && flags !== 'no issues flagged') {
    score -= 1;
    if (flags.includes('investigation') || flags.includes('sebi') || flags.includes('audit opinion') || flags.includes('qualified') || flags.includes('liability')) {
      score -= 1;
    }
  }
  if (revYoY.includes('-') || patYoY.includes('-')) {
    score -= 1;
  }
  if (revYoY.includes('+2') || revYoY.includes('+3') || revYoY.includes('+4') || revYoY.includes('+5') || revYoY.includes('+6') || revYoY.includes('+7') || revYoY.includes('+8') || revYoY.includes('+9') || revYoY.includes('+10') || revYoY.includes('+1')) {
    if (score < 5 && !isWatchlisted) {
      score = Math.min(5, score + 1);
    }
  }
  return Math.max(1, Math.min(5, score));
}

function getStage(row, headers) {
  const sector = String(row[headers.indexOf('Sector')] || '').toLowerCase();
  const drivers = String(row[headers.indexOf('Growth Drivers')] || '').toLowerCase();
  if (sector.includes('tech') || sector.includes('defence') || sector.includes('renewables') || sector.includes('battery') || sector.includes('fintech')) {
    return 'acceleration';
  }
  if (drivers.includes('early') || drivers.includes('pivot') || drivers.includes('start') || drivers.includes('commencing')) {
    return 'early_growth';
  }
  if (sector.includes('infrastructure') || sector.includes('paper') || sector.includes('sugar') || sector.includes('hosiery') || sector.includes('cement')) {
    return 'maturity';
  }
  return 'acceleration';
}

function getCatalystType(text) {
  text = text.toLowerCase();
  if (text.includes('capex') || text.includes('facility') || text.includes('plant') || text.includes('setup') || text.includes('expand capacity') || text.includes('investing')) {
    return 'capex';
  }
  if (text.includes('product') || text.includes('launch') || text.includes('design') || text.includes('develop') || text.includes('technology')) {
    return 'new_products';
  }
  if (text.includes('export') || text.includes('global') || text.includes('geographic') || text.includes('overseas') || text.includes('market') || text.includes('state') || text.includes('region')) {
    return 'geographic_expansion';
  }
  if (text.includes('margin') || text.includes('cost') || text.includes('price') || text.includes('savings') || text.includes('deflation') || text.includes('raw material')) {
    return 'margin_expansion';
  }
  if (text.includes('leverage') || text.includes('scale') || text.includes('volume') || text.includes('utilization') || text.includes('efficiency')) {
    return 'operating_leverage';
  }
  return 'operating_leverage';
}

migrate().catch(console.error);
