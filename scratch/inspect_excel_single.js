const XLSX = require('xlsx');
const path = require('path');

const demosDir = path.join(__dirname, '..', 'demos');

const files = [
  '12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx',
  '多门店分Sheet出库单.xlsx'
];

files.forEach(file => {
  const filepath = path.join(demosDir, file);
  console.log('\n==================================================');
  console.log(`FILE: ${file}`);
  const workbook = XLSX.readFile(filepath);
  console.log(`Sheets: ${workbook.SheetNames.join(', ')}`);

  workbook.SheetNames.forEach(sheetName => {
    console.log(`--- Sheet: ${sheetName} ---`);
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    
    // Print first 15 rows
    const rows = [];
    const endRow = Math.min(range.e.r, 20);
    const endCol = Math.min(range.e.c, 15);
    
    for (let r = range.s.r; r <= endRow; r++) {
      const row = [];
      for (let c = range.s.c; c <= endCol; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[cellRef];
        row.push(cell ? cell.w || cell.v : '');
      }
      rows.push(row);
    }
    
    rows.forEach((row, i) => {
      console.log(`Row ${i}: ${JSON.stringify(row)}`);
    });
  });
});
