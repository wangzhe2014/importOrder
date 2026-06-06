const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, '..', 'demos', '黔寨寨贵州烙锅（鞍山店）常温.pdf');
const dataBuffer = fs.readFileSync(filepath);

console.log('PDFParse is class?', typeof PDFParse);

try {
  const uint8 = new Uint8Array(dataBuffer);
  const parser = new PDFParse(uint8);
  parser.getText().then(res => {
    console.log('Successfully got text via getText():');
    console.log(res.text.substring(0, 1000));
  }).catch(err => {
    console.error('getText failed:', err);
  });
} catch (e) {
  console.error('New PDFParse failed:', e);
}

