const XLSX = require('xlsx');
const path = 'c:/Users/MAYANK JAIN/Downloads/frontend/fy26_full_company_data.xlsx';

try {
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets['Full Details'];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  const headers = data[2];
  const firstCompanyRow = data[3];
  
  console.log('MTAR Technologies Limited Data:');
  headers.forEach((h, idx) => {
    console.log(`\n[${h}]:`);
    console.log(firstCompanyRow[idx]);
  });
} catch(err) {
  console.error(err);
}
