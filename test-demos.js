const fs = require('fs');
const path = require('path');
const http = require('http');

const demosDir = path.join(__dirname, 'demos');
const files = fs.readdirSync(demosDir).filter(file => {
  const ext = file.toLowerCase().split('.').pop();
  return ['xlsx', 'xls', 'docx', 'pdf'].includes(ext) && !file.startsWith('~$');
});

console.log('找到测试文件:', files);

async function testFile(fileName) {
  return new Promise((resolve) => {
    const filePath = path.join(demosDir, fileName);
    
    if (!fs.existsSync(filePath)) {
      console.log(`文件不存在: ${fileName}`);
      resolve({ fileName, success: false, error: '文件不存在' });
      return;
    }
    
    const fileData = fs.readFileSync(filePath);
    const ext = fileName.toLowerCase().split('.').pop();
    
    const boundary = '----WebKitFormBoundary' + Date.now().toString(16);
    const contentType = {
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'xls': 'application/vnd.ms-excel',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'pdf': 'application/pdf'
    }[ext] || 'application/octet-stream';
    
    const body = Buffer.concat([
      Buffer.from('--' + boundary + '\r\n'),
      Buffer.from('Content-Disposition: form-data; name="file"; filename="' + fileName + '"\r\n'),
      Buffer.from('Content-Type: ' + contentType + '\r\n'),
      Buffer.from('\r\n'),
      fileData,
      Buffer.from('\r\n--' + boundary + '--\r\n')
    ]);
    
    const options = {
      hostname: 'localhost',
      port: 3004,
      path: '/api/parse-file',
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': body.length
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const success = res.statusCode === 200;
        let result;
        try {
          result = JSON.parse(data);
        } catch {
          result = { error: data.substring(0, 100) };
        }
        
        console.log(`\n=== ${fileName} ==`);
        console.log('状态:', res.statusCode);
        if (success) {
          console.log('类型:', result.type);
          if (result.sheets) {
            console.log('Sheet数量:', result.sheets.length);
            result.sheets.forEach((sheet, idx) => {
              console.log(`  Sheet${idx + 1}: ${sheet.name}, 行数: ${sheet.data.length}`);
            });
          } else if (result.lines) {
            console.log('行数:', result.lines.length);
            console.log('前3行:', result.lines.slice(0, 3));
          }
        } else {
          console.log('错误:', result.error || '未知错误');
        }
        
        resolve({ fileName, success, statusCode: res.statusCode, result });
      });
    });
    
    req.on('error', (e) => {
      console.log(`\n=== ${fileName} ==`);
      console.log('错误:', e.message);
      resolve({ fileName, success: false, error: e.message });
    });
    
    req.write(body);
    req.end();
  });
}

async function runTests() {
  console.log('=== 开始测试 demos 目录下的文件 ===\n');
  
  const results = [];
  for (const file of files) {
    const result = await testFile(file);
    results.push(result);
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('\n=== 测试结果汇总 ===');
  console.log(`总文件数: ${files.length}`);
  console.log(`成功: ${results.filter(r => r.success).length}`);
  console.log(`失败: ${results.filter(r => !r.success).length}`);
  
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    console.log('\n失败的文件:');
    failed.forEach(r => {
      console.log(`  - ${r.fileName}: ${r.error || r.result?.error || '未知错误'}`);
    });
  }
}

runTests();