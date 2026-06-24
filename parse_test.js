const fs = require('fs');

const content = fs.readFileSync('c:/Users/MAYANK JAIN/Downloads/frontend/Companies.txt', 'utf8');
const lines = content.split('\n');

const companies = [];
let currentCo = null;
let currentField = null; // 'performance', 'outlook', 'drivers', etc.

for (let line of lines) {
  line = line.trim();
  
  // Check if it's a new company header, e.g., "6. Manappuram Finance Limited"
  const headerMatch = line.match(/^(\d+)\.\s+(.+)$/);
  if (headerMatch) {
    if (currentCo) {
      companies.push(currentCo);
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
  
  // Check fields
  if (line.startsWith('Sector:')) {
    const val = line.substring(7).trim();
    // E.g. "NBFC / Gold Loans & Diversified Lending | NSE/BSE: MANAPPURAM"
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
  
  // Add to block lists if it's text
  if (currentField && line.length > 0) {
    // Ignore lines like "Continuing with..."
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
  companies.push(currentCo);
}

console.log(`Parsed ${companies.length} companies:`);
companies.forEach(c => {
  console.log(`- #${c.number}: ${c.name} [${c.ticker}] (${c.sector})`);
  console.log(`  Revenue: ${c.revenue.slice(0, 40)}...`);
  console.log(`  EBITDA: ${c.ebitda.slice(0, 40)}...`);
  console.log(`  PAT: ${c.pat.slice(0, 40)}...`);
  console.log(`  ROCE: ${c.roce.slice(0, 40)}...`);
  console.log(`  Guidance: ${c.guidance.slice(0, 40)}...`);
  console.log(`  Performance bullet count: ${c.performance.length}`);
  console.log(`  Outlook bullet count: ${c.outlook.length}`);
  console.log(`  Drivers bullet count: ${c.drivers.length}`);
  console.log();
});
