// test-pipeline.js
require('dotenv').config();
const { runPipelineForCompany } = require('./pipeline/runner');
const path = require('path');

async function test() {
  const ticker = process.argv[2] || 'INFY';
  const useLocal = process.argv[3] === 'local';
  const pdfSource = useLocal ? path.join(__dirname, 'test.pdf') : null;

  console.log(`🧪 Running pipeline for ticker: ${ticker}`);
  if (useLocal) {
    console.log(`Using local test file: ${pdfSource}`);
  } else {
    console.log(`Scraping latest PDF announcement from BSE/NSE...`);
  }

  try {
    const result = await runPipelineForCompany(ticker, pdfSource);
    console.log('\n==== TEST RESULT ====');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n🎉 Test completed successfully! Database updated.');
      process.exit(0);
    } else {
      console.error('\n❌ Test execution reported failure.');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ Pipeline test threw an exception:', err.message);
    process.exit(1);
  }
}

test();
