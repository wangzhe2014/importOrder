const XLSX = require('xlsx');
const path = require('path');
const filepath = path.join(__dirname, '..', 'demos', '欢乐牧场模板0430.xlsx');
const workbook = XLSX.readFile(filepath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];
console.log('欢乐牧场 Headers:', jsonData);
