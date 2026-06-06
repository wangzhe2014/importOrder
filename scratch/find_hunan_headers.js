const XLSX = require('xlsx');
const path = require('path');
const filepath = path.join(__dirname, '..', 'demos', '湖南仓.xlsx');
const workbook = XLSX.readFile(filepath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 })[1];
console.log('湖南仓 Headers:', jsonData);
