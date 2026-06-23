// run-all.js
require('dotenv').config();
const { runPipelineForAll } = require('./pipeline/runner');

async function main() {
  const limitArg = process.argv[2];
  const limit = limitArg ? parseInt(limitArg, 10) : null;

  console.log('🏁 Starting Bulk Ingestion Pipeline...');
  if (limit) {
    console.log(`Processing up to ${limit} companies from the database.`);
  } else {
    console.log('Processing all companies found in the database.');
  }

  try {
    const summary = await runPipelineForAll(limit);
    console.log('\n====================================');
    console.log('📊 BULK PIPELINE RUN SUMMARY:');
    console.log(`- Total Processed: ${summary.total}`);
    console.log(`- Success: ${summary.success}`);
    console.log(`- Failed: ${summary.failed}`);
    console.log('====================================');
    console.log('🎉 Bulk run completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Bulk pipeline run encountered a fatal error:', err.message);
    process.exit(1);
  }
}

main();
