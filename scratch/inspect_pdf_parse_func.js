const pdf = require('pdf-parse');
console.log('PDFParse type:', typeof pdf.PDFParse);
console.log('PDFParse keys:', Object.keys(pdf.PDFParse || {}));
console.log('PDFParse toString:', pdf.PDFParse ? pdf.PDFParse.toString() : 'undefined');
