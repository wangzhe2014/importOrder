const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const demosDir = path.join(__dirname, '..', 'demos');

const files = [
  '12.25海口龙湖天街-配送发货单PS2512220005001(1).xlsx',
  '多门店分Sheet出库单.xlsx',
  '欢乐牧场模板0430.xlsx',
  '湖南仓.xlsx',
  '门店调拨单-卡片式.xlsx'
];

files.forEach(file => {
  const filepath = path.join(demosDir, file);
  if (!fs.existsSync(filepath)) {
    console.log(`File not found: ${file}`);
    return;
  }
  console.log('\n==================================================');
  console.log(`FILE: ${file}`);
  const workbook = XLSX.readFile(filepath);
  console.log(`Sheets: ${workbook.SheetNames.join(', ')}`);

  workbook.SheetNames.forEach(sheetName => {
    console.log(`--- Sheet: ${sheetName} ---`);
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    console.log(`Range: ${sheet['!ref']}`);
    
    // Print first 12 rows
    const rows = [];
    const endRow = Math.min(range.e.r, 15);
    const endCol = Math.min(range.e.c, 10); // show up to 10 columns
    
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
