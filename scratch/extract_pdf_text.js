const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const filepath = path.join(__dirname, '..', 'demos', '黔寨寨贵州烙锅（鞍山店）常温.pdf');
const dataBuffer = fs.readFileSync(filepath);

pdf(dataBuffer).then(function(data) {
  console.log('PDF Page count:', data.numpages);
  console.log('PDF Text:');
  console.log(data.text.substring(0, 3000));
  
  // Also print lines
  const lines = data.text.split('\n');
  console.log('\n--- FIRST 50 LINES ---');
  for (let i = 0; i < Math.min(50, lines.length); i++) {
    console.log(`Line ${i}: [${lines[i]}]`);
  }
}).catch(err => {
  console.error('Error parsing pdf:', err);
});
