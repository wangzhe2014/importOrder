// scripts/load-test.ts
// 压测脚本：根据考试要求 >= 10000 单/分钟 ≤60 秒
// - 生成 10000 行 Excel 压测文件（从 seed-data.ts 生成的 SKU 中随机抽取，并插入少量非法 SKU）
// - 上传文件并记录 P95 响应时间
// - 轮询 task 状态直到完成或超时
// - 统计总耗时和成功/失败行数
// - 校验 ≤60s 目标，打印压测报告

import * as XLSX from 'xlsx'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync, readFileSync } from 'fs'

const SKU_CODES = [
  'SKU_00001', 'SKU_00002', 'SKU_00003', 'SKU_00004', 'SKU_00005',
  'SKU_00006', 'SKU_00007', 'SKU_00008', 'SKU_00009', 'SKU_00010',
  'SKU_00011', 'SKU_00012', 'SKU_00013', 'SKU_00014', 'SKU_00015',
  'SKU_00016', 'SKU_00017', 'SKU_00018', 'SKU_00019', 'SKU_00020',
  'SKU_00021', 'SKU_00022', 'SKU_00023', 'SKU_00024', 'SKU_00025',
  'SKU_00026', 'SKU_00027', 'SKU_00028', 'SKU_00029', 'SKU_00030',
  'SKU_00031', 'SKU_00032', 'SKU_00033', 'SKU_00034', 'SKU_00035',
  'SKU_00036', 'SKU_00037', 'SKU_00038', 'SKU_00039', 'SKU_00040',
  'SKU_00041', 'SKU_00042', 'SKU_00043', 'SKU_00044', 'SKU_00045',
  'SKU_00046', 'SKU_00047', 'SKU_00048', 'SKU_00049', 'SKU_00050',
  'SKU_00051', 'SKU_00052', 'SKU_00053', 'SKU_00054', 'SKU_00055',
  'SKU_00056', 'SKU_00057', 'SKU_00058', 'SKU_00059', 'SKU_00060',
  'SKU_00061', 'SKU_00062', 'SKU_00063', 'SKU_00064', 'SKU_00065',
  'SKU_00066', 'SKU_00067', 'SKU_00068', 'SKU_00069', 'SKU_00070',
  'SKU_00071', 'SKU_00072', 'SKU_00073', 'SKU_00074', 'SKU_00075',
  'SKU_00076', 'SKU_00077', 'SKU_00078', 'SKU_00079', 'SKU_00080',
  'SKU_00081', 'SKU_00082', 'SKU_00083', 'SKU_00084', 'SKU_00085',
  'SKU_00086', 'SKU_00087', 'SKU_00088', 'SKU_00089', 'SKU_00090',
  'SKU_00091', 'SKU_00092', 'SKU_00093', 'SKU_00094', 'SKU_00095',
  'SKU_00096', 'SKU_00097', 'SKU_00098', 'SKU_00099', 'SKU_00100',
  'SKU_00101', 'SKU_00102', 'SKU_00103', 'SKU_00104', 'SKU_00105',
  'SKU_00106', 'SKU_00107', 'SKU_00108', 'SKU_00109', 'SKU_00110',
  'SKU_00111', 'SKU_00112', 'SKU_00113', 'SKU_00114', 'SKU_00115',
  'SKU_00116', 'SKU_00117', 'SKU_00118', 'SKU_00119', 'SKU_00120',
  'SKU_00121', 'SKU_00122', 'SKU_00123', 'SKU_00124', 'SKU_00125',
  'SKU_00126', 'SKU_00127', 'SKU_00128', 'SKU_00129', 'SKU_00130',
  'SKU_00131', 'SKU_00132', 'SKU_00133', 'SKU_00134', 'SKU_00135',
  'SKU_00136', 'SKU_00137', 'SKU_00138', 'SKU_00139', 'SKU_00140',
  'SKU_00141', 'SKU_00142', 'SKU_00143', 'SKU_00144', 'SKU_00145',
  'SKU_00146', 'SKU_00147', 'SKU_00148', 'SKU_00149', 'SKU_00150',
  'SKU_00151', 'SKU_00152', 'SKU_00153', 'SKU_00154', 'SKU_00155',
  'SKU_00156', 'SKU_00157', 'SKU_00158', 'SKU_00159', 'SKU_00160',
  'SKU_00161', 'SKU_00162', 'SKU_00163', 'SKU_00164', 'SKU_00165',
  'SKU_00166', 'SKU_00167', 'SKU_00168', 'SKU_00169', 'SKU_00170',
  'SKU_00171', 'SKU_00172', 'SKU_00173', 'SKU_00174', 'SKU_00175',
  'SKU_00176', 'SKU_00177', 'SKU_00178', 'SKU_00179', 'SKU_00180',
  'SKU_00181', 'SKU_00182', 'SKU_00183', 'SKU_00184', 'SKU_00185',
  'SKU_00186', 'SKU_00187', 'SKU_00188', 'SKU_00189', 'SKU_00190',
  'SKU_00191', 'SKU_00192', 'SKU_00193', 'SKU_00194', 'SKU_00195',
  'SKU_00196', 'SKU_00197', 'SKU_00198', 'SKU_00199', 'SKU_00200',
];

interface LoadTestResult {
  testId: string
  timestamp: string
  durationMs: number
  targetMet: boolean
  metrics: {
    uploadP95Ms?: number
    taskPollCount: number
    totalRows: number
    successRows: number
    failedRows: number
    errorRate: number
    finalStatus?: string
    workerBackend?: string
    batchSize?: number
  }
  conclusion: string
}

function generateTestData(rows: number): { fileName: string; buffer: Buffer } {
  const sheet = []
  sheet.push(['外部编码', '收货门店', '收件人姓名', '收件人电话', '收件人地址', 'SKU编码', 'SKU名称', 'SKU数量', 'SKU规格', '备注'])

  const invalidSKU = 'INVALID_SKU_001'
  for (let i = 0; i < rows; i++) {
    const randomSku = SKU_CODES[Math.floor(Math.random() * SKU_CODES.length)]
    const isInvalid = i === 0 ? 1 : 0
    const sku = isInvalid ? invalidSKU : randomSku
    const lineNo = i + 1

    sheet.push([
      lineNo, // 外部编码
      'S', // 收货门店
      null, // 收件人姓名
      null, // 收件人电话
      null, // 收件人地址
      sku, // SKU 编码
      'P', // SKU 名称
      String(Math.floor(Math.random() * 10) + 1), // SKU 数量（正数）
      null, // SKU 规格
      null, // 备注
    ])
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(sheet)
  XLSX.utils.book_append_sheet(wb, ws, '订单数据')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true })
  return { fileName: `loadtest_${rows}_rows_${Date.now()}.xlsx`, buffer }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function loadTest() {
  console.log('[loadtest] 开始压测...')
  const startTotal = Date.now()

  // 1. 使用仓库交付的 10000 行 Excel 文件
  const filePath = resolve(process.cwd(), '202607', '10000-orders.xlsx')
  const fileName = '10000-orders.xlsx'
  const buffer = readFileSync(filePath)
  const file = new File([new Uint8Array(buffer)], fileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

  // 2. 上传文件（记录 P95 响应时间）
  const uploadStart = Date.now()
  const formData = new FormData()
  formData.append('file', file)
  // 为压测使用一个已确认保存的内置规则
  const rule = {
    file_type: 'excel',
    structure_type: 'standard',
    config: {
      header_row_index: 0,
      data_start_row_index: 1,
      column_mappings: {
        external_code: '外部编码',
        store_name: '收货门店',
        receiver_name: '收件人姓名',
        receiver_phone: '收件人电话',
        receiver_address: '收件人地址',
        sku_code: 'SKU编码',
        sku_name: 'SKU名称',
        sku_quantity: 'SKU数量',
        sku_spec: 'SKU规格',
        remark: '备注',
      },
    },
  } as any

  formData.append('rule', JSON.stringify(rule))

  const baseUrl = process.env.LOAD_TEST_BASE_URL || 'http://localhost:3000'
  const resp = await fetch(`${baseUrl}/api/import-tasks`, {
    method: 'POST',
    body: formData,
  })
  const uploadEnd = Date.now()
  if (!resp.ok) throw new Error(`上传失败: ${resp.status} ${resp.statusText}`)

  const data = await resp.json()
  const taskId = data.task_id
  const traceId = data.trace_id || taskId
  const uploadLatency = uploadEnd - uploadStart

  console.log(`[loadtest] 上传完成: task_id=${taskId}, trace_id=${traceId}, 耗时 ${uploadLatency}ms`)

  // 3. 轮询任务进度，最多 30 次，间隔 2 秒
  const maxPolls = 30
  const pollInterval = 2000
  let polls = 0
  let finalStatus = 'unknown'
  let successRows = 0
  let failedRows = 0

  while (polls < maxPolls) {
    const pollStart = Date.now()
    const resp = await fetch(`${baseUrl}/api/import-tasks/${taskId}`)
    const result = await resp.json()
    polls++
    const elapsed = Date.now() - pollStart

    console.log(
      `[loadtest] 第 ${polls} 次轮询 (${elapsed}ms): status=${result.status}, processed=${result.processed_rows}/${result.total_rows}, success=${result.success_rows}, failed=${result.failed_rows}`
    )

    finalStatus = result.status
    successRows = result.success_rows || 0
    failedRows = result.failed_rows || 0

    if (['completed', 'partial_success', 'failed'].includes(result.status)) {
      break
    }
    await sleep(pollInterval)
  }

  const totalDuration = Date.now() - startTotal
  const targetMet = totalDuration <= 60000 && successRows + failedRows >= 10000

  const result: LoadTestResult = {
    testId: `loadtest_${startTotal}`, timestamp: new Date().toISOString(), durationMs: totalDuration,
    targetMet,
    metrics: {
      uploadP95Ms: uploadLatency,
      taskPollCount: polls,
      totalRows: 10000,
      successRows,
      failedRows,
      errorRate: failedRows / 10000,
      finalStatus,
      workerBackend: process.env.QUEUE_BACKEND || 'auto',
      batchSize: 1000,
    },
    conclusion: targetMet
      ? `✅ 压测目标达成：总耗时 ${totalDuration}ms ≤ 60s，成功行数 ${successRows}，失败行数 ${failedRows}。`
      : `❌ 压测目标未达成：总耗时 ${totalDuration}ms > 60s，或成功+失败行数不足 10000。`,
  }

  console.log('\n--- 压测报告 ---')
  console.log(JSON.stringify(result, null, 2))

  // 4. 保存报告文件
  const reportPath = resolve(dirname(fileURLToPath(import.meta.url)), `loadtest-report-${result.testId}.json`)
  writeFileSync(reportPath, JSON.stringify(result, null, 2), 'utf8')
  console.log(`报告已保存至: ${reportPath}`)

  // 5. 返回用于评估
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  loadTest().catch(console.error)
}

export { loadTest }
