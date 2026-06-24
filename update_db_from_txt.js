require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabase = require('./config/supabase');

function cleanName(n) {
  return String(n || '')
    .toLowerCase()
    .replace(/limited|ltd|corp|corporation|incorporated|inc|company|co|&|and|\(|\)/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function extractGrowth(str) {
  if (!str) return 'N/A';
  const match = str.match(/([+-]?\d+(?:\.\d+)?%)\s+YoY/i) || str.match(/up\s+(\d+(?:\.\d+)?%)/i) || str.match(/down\s+(\d+(?:\.\d+)?%)/i);
  return match ? match[1] : 'N/A';
}

function extractMargin(str) {
  if (!str) return 'N/A';
  const match = str.match(/(\d+(?:\.\d+)?%)\s+margin/i) || str.match(/margin\s+of\s+(\d+(?:\.\d+)?%)/i) || str.match(/(\d+(?:\.\d+)?%)/);
  return match ? match[1] : 'N/A';
}

function extractRoceBadge(str) {
  if (!str) return 'Sustained';
  if (str.toLowerCase().includes('declin') || str.toLowerCase().includes('deteriorat')) return 'Declining';
  if (str.toLowerCase().includes('improv') || str.toLowerCase().includes('sharp')) return 'Improving';
  if (str.toLowerCase().includes('weak')) return 'Weak';
  return 'Sustained';
}

function getCatalystType(text) {
  text = text.toLowerCase();
  if (text.includes('capex') || text.includes('facility') || text.includes('plant') || text.includes('setup') || text.includes('expand capacity') || text.includes('investing')) {
    return 'capex';
  }
  if (text.includes('product') || text.includes('launch') || text.includes('design') || text.includes('develop') || text.includes('technology') || text.includes('jv') || text.includes('joint venture')) {
    return 'new_products';
  }
  if (text.includes('export') || text.includes('global') || text.includes('geographic') || text.includes('overseas') || text.includes('market') || text.includes('state') || text.includes('region') || text.includes('international') || text.includes('sweden') || text.includes('us')) {
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

function calculateScoreAndStage(co) {
  let score = 4;
  let stage = 'acceleration';
  
  const textToScan = (co.overview + ' ' + co.roce + ' ' + co.outlook.join(' ')).toLowerCase();
  
  if (textToScan.includes('gst') || textToScan.includes('investigation') || textToScan.includes('sebi') || textToScan.includes('covenant') || textToScan.includes('qualified') || textToScan.includes('overhang') || textToScan.includes('litigation') || textToScan.includes('ban') || textToScan.includes('provision')) {
    score -= 1;
    if (textToScan.includes('gst') || textToScan.includes('investigation') || textToScan.includes('ban') || textToScan.includes('provision')) {
      score -= 1;
    }
  }
  
  if (textToScan.includes('deteriorat') || textToScan.includes('collaps') || textToScan.includes('declin') || textToScan.includes('compress')) {
    score -= 1;
  }
  
  if (co.revenue.includes('-') || co.pat.includes('-') || textToScan.includes('loss') || textToScan.includes('deficit')) {
    score -= 1;
  }
  
  score = Math.max(1, Math.min(5, score));
  
  const sector = co.sector.toLowerCase();
  if (sector.includes('infrastructure') || sector.includes('sugar') || sector.includes('textile') || sector.includes('cement') || sector.includes('hosiery')) {
    stage = 'maturity';
  } else if (sector.includes('defence') || sector.includes('aerospace') || sector.includes('clean energy') || sector.includes('specialty chemical') || sector.includes('battery')) {
    stage = 'acceleration';
  } else if (sector.includes('gaming') || sector.includes('fintech') || sector.includes('retail')) {
    stage = 'acceleration';
  }
  
  return { score, stage };
}

async function migrate() {
  console.log('🌱 Starting DB Ingestion from Companies.txt...');
  
  // 1. Fetch existing companies from Supabase
  const { data: dbCos, error: coErr } = await supabase.from('companies').select('*');
  if (coErr) throw coErr;
  console.log(`Loaded ${dbCos.length} companies from Supabase.`);
  
  // 2. Read and parse Companies.txt
  const content = fs.readFileSync('c:/Users/MAYANK JAIN/Downloads/frontend/Companies.txt', 'utf8');
  const lines = content.split('\n');
  
  const parsedCos = [];
  let currentCo = null;
  let currentField = null;
  
  for (let line of lines) {
    line = line.trim();
    
    const headerMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (headerMatch) {
      if (currentCo) {
        parsedCos.push(currentCo);
      }
      currentCo = {
        number: parseInt(headerMatch[1]),
        name: headerMatch[2].trim(),
        sector: '',
        ticker: '',
        overview: '',
        revenue: '',
        ebitda: '',
        pat: '',
        roce: '',
        performance: [],
        outlook: [],
        guidance: '',
        drivers: []
      };
      currentField = null;
      continue;
    }
    
    if (!currentCo) continue;
    
    if (line.startsWith('Sector:')) {
      const val = line.substring(7).trim();
      const parts = val.split('|');
      currentCo.sector = parts[0].trim();
      if (parts[1]) {
        const tickerPart = parts[1].match(/NSE\/BSE:\s*([A-Z0-9\-&]+)|NSE:\s*([A-Z0-9\-&]+)|BSE:\s*([A-Z0-9\-&]+)/i);
        if (tickerPart) {
          currentCo.ticker = (tickerPart[1] || tickerPart[2] || tickerPart[3]).trim().toUpperCase();
        }
      }
      continue;
    }
    
    if (line.startsWith('Company Overview:')) {
      currentCo.overview = line.substring(17).trim();
      continue;
    }
    
    if (line.startsWith('Revenue (FY26):')) {
      currentCo.revenue = line.substring(15).trim();
      continue;
    }
    
    if (line.startsWith('EBITDA (FY26):')) {
      currentCo.ebitda = line.substring(14).trim();
      continue;
    }
    
    if (line.startsWith('PAT (FY26):')) {
      currentCo.pat = line.substring(11).trim();
      continue;
    }
    
    if (line.startsWith('ROCE/ROE:') || line.startsWith('ROCE:')) {
      const idx = line.indexOf(':');
      currentCo.roce = line.substring(idx + 1).trim();
      continue;
    }
    
    if (line.startsWith('Full Year Performance:')) {
      currentField = 'performance';
      continue;
    }
    
    if (line.startsWith('Key Outlook & Performance:')) {
      currentField = 'outlook';
      continue;
    }
    
    if (line.startsWith('FY27 Guidance:')) {
      currentCo.guidance = line.substring(14).trim();
      currentField = null;
      continue;
    }
    
    if (line.startsWith('Key Growth Drivers:')) {
      currentField = 'drivers';
      continue;
    }
    
    if (currentField && line.length > 0) {
      if (line.startsWith('Continuing with') || line.includes('Searched the web')) {
        continue;
      }
      if (currentField === 'performance') {
        currentCo.performance.push(line);
      } else if (currentField === 'outlook') {
        currentCo.outlook.push(line);
      } else if (currentField === 'drivers') {
        currentCo.drivers.push(line);
      }
    }
  }
  
  if (currentCo) {
    parsedCos.push(currentCo);
  }
  
  console.log(`Parsed ${parsedCos.length} companies from file.`);
  
  // Load existing metrics json if any
  const metricsFilePath = path.join(__dirname, 'company_metrics.json');
  let metricsJson = {};
  if (fs.existsSync(metricsFilePath)) {
    try {
      metricsJson = JSON.parse(fs.readFileSync(metricsFilePath, 'utf8'));
    } catch(e) {
      console.error('Error reading company_metrics.json:', e);
    }
  }
  
  for (const co of parsedCos) {
    console.log(`\n----------------------------------------`);
    console.log(`Processing #${co.number}: ${co.name} [${co.ticker}]...`);
    
    const cleanedFile = cleanName(co.name);
    
    // Find matching company in DB
    let dbCo = dbCos.find(c => {
      if (c.ticker === co.ticker) return true;
      const cleanedDb = cleanName(c.name);
      return cleanedDb.includes(cleanedFile) || cleanedFile.includes(cleanedDb);
    });
    
    let companyId;
    
    if (dbCo) {
      companyId = dbCo.id;
      console.log(`Matched existing company in DB: "${dbCo.name}" (ID: ${companyId})`);
    } else {
      console.log(`Unmatched! Creating new company: "${co.name}" with Ticker: ${co.ticker}...`);
      
      // Double check by ticker again in case of db query delay
      const { data: existingCo, error: findErr } = await supabase
        .from('companies')
        .select('*')
        .eq('ticker', co.ticker)
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
            name: co.name,
            ticker: co.ticker,
            industry: co.sector || 'Miscellaneous',
            is_sample: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();
          
        if (insErr) {
          console.error(`Error inserting company ${co.name}:`, insErr.message);
          continue;
        }
        companyId = newCo.id;
        console.log(`Inserted new company in DB with id: ${companyId}`);
      }
    }
    
    // Calculate score, stage and tags
    const { score, stage } = calculateScoreAndStage(co);
    
    // Tags
    const tags = [];
    const fullText = (co.overview + ' ' + co.performance.join(' ') + ' ' + co.outlook.join(' ') + ' ' + co.guidance).toLowerCase();
    if (fullText.includes('capex') || fullText.includes('expansion') || fullText.includes('capacity') || fullText.includes('commission')) {
      tags.push('capex');
    }
    if (fullText.includes('export') || fullText.includes('global') || fullText.includes('geographic') || fullText.includes('international') || fullText.includes('sweden')) {
      tags.push('geographic_expansion');
    }
    if (fullText.includes('margin') || fullText.includes('cost savings') || fullText.includes('efficiency')) {
      tags.push('margin_expansion');
    }
    if (fullText.includes('product') || fullText.includes('launch') || fullText.includes('jv') || fullText.includes('new energy')) {
      tags.push('new_products');
    }
    if (fullText.includes('gst') || fullText.includes('investigation') || fullText.includes('risk') || fullText.includes('litigation') || fullText.includes('qualified')) {
      tags.push('risk');
    }
    if (tags.length === 0) {
      tags.push('operating_leverage');
    }
    
    const topTrigger = co.drivers[0] || 'Capacity expansion and operational scale-up.';
    
    // Update company details
    const { error: upErr } = await supabase
      .from('companies')
      .update({
        name: co.name,
        industry: co.sector || dbCo?.industry,
        top_trigger: topTrigger,
        catalyst_tags: tags,
        score: score,
        stage: stage,
        is_sample: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', companyId);
      
    if (upErr) {
      console.error(`Error updating company headers for ${co.ticker}:`, upErr.message);
      continue;
    }
    console.log(`Updated company headers (Score: ${score}, Stage: ${stage}, Tags: ${tags.join(', ')}).`);
    
    // Clean associated details
    await supabase.from('triggers').delete().eq('company_id', companyId);
    await supabase.from('signals').delete().eq('company_id', companyId);
    await supabase.from('concall_snapshots').delete().eq('company_id', companyId);
    console.log('Purged old references in detail tables.');
    
    // Seed triggers
    if (co.drivers.length > 0) {
      const triggerData = co.drivers.map((text, idx) => ({
        company_id: companyId,
        quarter: 'Q4FY26',
        trigger_text: text,
        catalyst_type: getCatalystType(text),
        conviction_score: idx === 0 ? 5 : 4,
        source_quote: `Our key growth driver includes: ${text}`
      }));
      
      const { error: tErr } = await supabase.from('triggers').insert(triggerData);
      if (tErr) console.error('Error seeding triggers:', tErr.message);
      else console.log(`Seeded ${triggerData.length} triggers.`);
    }
    
    // Seed signals
    const signals = [];
    
    // 1. Guidance signal
    if (co.guidance && co.guidance.toLowerCase() !== 'n/a' && !co.guidance.toLowerCase().includes('not explicitly')) {
      signals.push({
        company_id: companyId,
        quarter: 'Q4FY26',
        signal_type: 'guidance',
        content: co.guidance,
        confidence: 4,
        source: 'Q4 FY26 Earnings Call'
      });
    }
    
    // 2. ROCE / ROIC signal
    if (co.roce && co.roce.toLowerCase() !== 'n/a' && !co.roce.toLowerCase().includes('not explicitly')) {
      signals.push({
        company_id: companyId,
        quarter: 'Q4FY26',
        signal_type: 'margin',
        content: `Return profile: ${co.roce}`,
        confidence: 4,
        source: 'FY26 Financial Results'
      });
    }
    
    // 3. Scan for risks to add a risk signal
    const risksText = co.outlook.filter(o => o.toLowerCase().includes('risk') || o.toLowerCase().includes('concern') || o.toLowerCase().includes('investigation') || o.toLowerCase().includes('gst') || o.toLowerCase().includes('covenant')).join(' ');
    if (risksText) {
      signals.push({
        company_id: companyId,
        quarter: 'Q4FY26',
        signal_type: 'risk',
        content: risksText,
        confidence: 5,
        source: 'Annual Brief / Auditor Notes'
      });
    }
    
    // 4. Scan for capex to add capex signal
    const capexText = co.outlook.find(o => o.toLowerCase().includes('capex') || o.toLowerCase().includes('commission') || o.toLowerCase().includes('plant') || o.toLowerCase().includes('expansion'));
    if (capexText) {
      signals.push({
        company_id: companyId,
        quarter: 'Q4FY26',
        signal_type: 'capex',
        content: capexText,
        confidence: 4,
        source: 'FY26 Management Briefing'
      });
    }
    
    if (signals.length > 0) {
      const { error: sErr } = await supabase.from('signals').insert(signals);
      if (sErr) console.error('Error seeding signals:', sErr.message);
      else console.log(`Seeded ${signals.length} signals.`);
    }
    
    // Seed concall snapshot
    const revTrend = co.revenue.includes('-') || co.revenue.toLowerCase().includes('decline') ? 'down' : 'up';
    const marginTrend = co.pat.includes('-') || co.pat.toLowerCase().includes('decline') || co.roce.toLowerCase().includes('decline') ? 'down' : 'up';
    const tone = score <= 3 ? 'cautious' : 'positive';
    
    const keyQuotes = co.performance.slice(0, 3).map((text, idx) => ({
      text: text,
      speaker: idx === 0 ? 'Management Team' : 'Executive Board',
      quarter: 'Q4FY26'
    }));
    
    const { error: snapErr } = await supabase.from('concall_snapshots').insert({
      company_id: companyId,
      quarter: 'Q4FY26',
      revenue_trend: revTrend,
      margin_trend: marginTrend,
      tone: tone,
      guidance_summary: co.guidance || 'No specific guidance details provided.',
      capex_commentary: capexText || 'No specific capex plans detailed.',
      risks: risksText || 'General macro and industry dependencies.',
      key_quotes: keyQuotes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    
    if (snapErr) console.error('Error seeding snapshot:', snapErr.message);
    else console.log('Seeded concall snapshot successfully.');
    
    // Save to company_metrics.json overrides
    const metricRevenue = co.revenue.split(';')[0].split('(')[0].trim();
    const metricPat = co.pat.split(';')[0].split('(')[0].trim();
    const metricEbitda = co.ebitda.split(';')[0].split('(')[0].trim();
    
    metricsJson[co.ticker] = {
      fiscal_year: 'FY26',
      revenue: metricRevenue,
      revenue_str: metricRevenue,
      revenue_growth: extractGrowth(co.revenue) || 'N/A',
      ebitda_margin: extractMargin(co.ebitda) || 'N/A',
      ebitda_str: metricEbitda,
      ebitda_growth: extractGrowth(co.ebitda) || 'N/A',
      pat: metricPat,
      pat_str: metricPat,
      pat_growth: extractGrowth(co.pat) || 'N/A',
      roce: co.roce.split(';')[0].trim(),
      roce_str: co.roce.split(';')[0].trim(),
      roce_badge: extractRoceBadge(co.roce),
      debt_equity: 'N/A',
      highlights: co.performance.slice(0, 3),
      outlook: co.outlook.slice(0, 3).join(' '),
      risks: co.outlook.filter(o => o.toLowerCase().includes('risk') || o.toLowerCase().includes('concern') || o.toLowerCase().includes('investigation') || o.toLowerCase().includes('gst'))
    };
  }
  
  // Write merged metrics back to company_metrics.json
  fs.writeFileSync(metricsFilePath, JSON.stringify(metricsJson, null, 2), 'utf8');
  console.log(`\n🎉 Merged and wrote ${Object.keys(metricsJson).length} total companies metrics to company_metrics.json.`);
  console.log('🎉 Database seeding and metrics overrides setup completed successfully!');
}

migrate().catch(console.error);
