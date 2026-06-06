/**
 * Demo 解析验收脚本
 * 用法：
 *   1. 先启动本地服务：npm run dev -- -p 3001
 *   2. 再运行：node test-parse-all.mjs
 *
 * 脚本会读取 saved_rules.json，并对每个 demo 文件尝试所有同类型规则，
 * 选择有效运单数量最多的规则作为该文件的验收结果。
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEMOS_DIR = path.join(__dirname, 'demos')
const RULES_PATH = path.join(__dirname, 'saved_rules.json')
const BASE_URL = process.env.TEST_URL || 'http://localhost:3001'

const rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'))
const testFiles = fs.readdirSync(DEMOS_DIR).filter(file => {
  const ext = file.toLowerCase().split('.').pop()
  return ['xlsx', 'xls', 'docx', 'pdf'].includes(ext) && !file.startsWith('~$')
})

function expectedType(fileName) {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'xlsx' || ext === 'xls') return 'excel'
  if (ext === 'docx') return 'word'
  return 'pdf'
}

function isValidShipment(row) {
  const hasSku = Boolean(row?.sku_code || row?.sku_name)
  const hasQty = Number(row?.sku_quantity) > 0
  const hasReceiver = Boolean(row?.store_name || (row?.receiver_name && row?.receiver_phone && row?.receiver_address))
  return hasSku && hasQty && hasReceiver
}

async function parseFile(filePath, fileName) {
  const formData = new FormData()
  const fileContent = fs.readFileSync(filePath)
  const blob = new Blob([fileContent])
  formData.set('file', blob, fileName)

  const response = await fetch(`${BASE_URL}/api/parse-file`, {
    method: 'POST',
    body: formData,
  })
  const data = await response.json()
  if (!response.ok || data.error) {
    throw new Error(data.error || `HTTP ${response.status}`)
  }
  return data
}

async function parseWithRule(parsedData, rule) {
  const response = await fetch(`${BASE_URL}/api/parse-with-rule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rule, parsedData }),
  })
  const data = await response.json()
  if (!response.ok || data.error) {
    return { rule, shipments: [], error: data.error || `HTTP ${response.status}` }
  }
  return { rule, shipments: data.shipments || [] }
}

async function main() {
  const results = []

  console.log('='.repeat(72))
  console.log(`Demo 文件：${testFiles.length} 个`)
  console.log(`规则样例：${rules.length} 条`)
  console.log('='.repeat(72))

  for (const fileName of testFiles) {
    const filePath = path.join(DEMOS_DIR, fileName)
    const fileType = expectedType(fileName)
    const candidateRules = rules.filter(rule => rule.file_type === fileType)

    console.log(`\n【${fileName}】`)
    console.log(`类型：${fileType}，候选规则：${candidateRules.length}`)

    try {
      const parsedData = await parseFile(filePath, fileName)
      const attempts = []

      for (const rule of candidateRules) {
        const attempt = await parseWithRule(parsedData, rule)
        const validCount = attempt.shipments.filter(isValidShipment).length
        attempts.push({ ...attempt, validCount })
        console.log(`  - ${rule.name}: ${attempt.shipments.length} 条，${validCount} 条有效${attempt.error ? `，错误：${attempt.error}` : ''}`)
      }

      const best = attempts.sort((a, b) => b.validCount - a.validCount || b.shipments.length - a.shipments.length)[0]
      const passed = Boolean(best && best.validCount > 0)

      if (passed) {
        const first = best.shipments.find(isValidShipment) || best.shipments[0]
        console.log(`  ✅ 最佳规则：${best.rule.name}`)
        console.log(`     有效运单：${best.validCount}`)
        console.log(`     首条：${first.external_code || '-'} / ${first.store_name || first.receiver_name || '-'} / ${first.sku_code || '-'} / ${first.sku_name || '-'} / ${first.sku_quantity || '-'}`)
      } else {
        console.log('  ❌ 未找到可解析出有效运单的规则')
      }

      results.push({ fileName, passed, bestRule: best?.rule?.name || '-', validCount: best?.validCount || 0 })
    } catch (error) {
      console.log(`  ❌ 文件解析失败：${error.message}`)
      results.push({ fileName, passed: false, bestRule: '-', validCount: 0, error: error.message })
    }
  }

  console.log('\n' + '='.repeat(72))
  console.log('验收汇总')
  console.log('='.repeat(72))
  results.forEach(result => {
    console.log(`${result.passed ? '✅' : '❌'} ${result.fileName} | ${result.bestRule} | 有效 ${result.validCount}`)
  })
  console.log(`通过：${results.filter(result => result.passed).length}/${results.length}`)

  if (results.some(result => !result.passed)) {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
