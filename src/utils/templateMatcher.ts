import { ShipmentData, ColumnMapping, TemplateMatch, REQUIRED_FIELDS } from '@/types';
const KNOWN_HEADERS: Record<string, string[]> = {
 external_code: ['外部编码', '订单号', '单号', '运单号', '订单编号', 'order_no', 'tracking_no'],
 sender_name: ['发件人姓名', '寄件人', '发货人', '发件人', '寄件人姓名', 'sender', 'sender_name'],
 sender_phone: ['发件人电话', '寄件人电话', '发货人电话', '联系电话', 'sender_phone', 'phone'],
 sender_address: ['发件人地址', '寄件人地址', '发货地址', 'sender_address', 'address'],
 receiver_name: ['收件人姓名', '收货人', '收件人', 'receiver', 'receiver_name', 'consignee'],
 receiver_phone: ['收件人电话', '收货人电话', '联系电话', 'receiver_phone', 'phone'],
 receiver_address: ['收件人地址', '收货地址', 'receiver_address', 'address'],
 weight: ['重量', '重量(kg)', 'weight', 'kg', 'weight_kg'],
 quantity: ['件数', '数量', '包裹数', 'quantity', 'count', 'num'],
 temperature: ['温层', '温度', '温控', 'temperature', 'temp'],
 remark: ['备注', '备注信息', '说明', 'remark', 'note', 'comments'],
};
export function findBestTemplate(headers: string[]): TemplateMatch {
 const storedTemplates = getStoredTemplates();
 let bestMatch: TemplateMatch = {
 templateName: '未知模板',
 confidence: 0,
 mappings: {},
 };
 for (const template of storedTemplates) {
 const confidence = calculateConfidence(headers, template.mappings);
 if (confidence > bestMatch.confidence) {
 bestMatch = {
 templateName: template.templateName,
 confidence,
 mappings: { ...template.mappings },
 };
 }
 }
 if (bestMatch.confidence < 0.5) {
 const autoMappings = autoDetectMappings(headers);
 bestMatch.mappings = autoMappings;
 const confidence = calculateConfidence(headers, autoMappings);
 bestMatch.confidence = confidence;
 }
 return bestMatch;
}
function calculateConfidence(headers: string[], mappings: {
 [key: string]: string;
}): number {
 let matches = 0;
 let total = 0;
 for (const targetField of REQUIRED_FIELDS) {
 const sourceHeader = mappings[targetField];
 if (sourceHeader) {
 total++;
 if (headers.includes(sourceHeader)) {
 matches++;
 }
 }
 }
 return total > 0 ? matches / total : 0;
}
function autoDetectMappings(headers: string[]): {
 [key: string]: string;
} {
 const mappings: {
 [key: string]: string;
 } = {};
 for (const [targetField, possibleHeaders] of Object.entries(KNOWN_HEADERS)) {
 for (const possibleHeader of possibleHeaders) {
 const matchedHeader = headers.find((h) => h.toLowerCase().includes(possibleHeader.toLowerCase()) ||
 possibleHeader.toLowerCase().includes(h.toLowerCase()));
 if (matchedHeader) {
 mappings[targetField] = matchedHeader;
 break;
 }
 }
 }
 return mappings;
}
export function storeTemplate(name: string, mappings: {
 [key: string]: string;
}): void {
 const templates = getStoredTemplates();
 const existingIndex = templates.findIndex((t) => t.templateName === name);
 const newTemplate: ColumnMapping = {
 templateName: name,
 mappings,
 created_at: Date.now(),
 };
 if (existingIndex >= 0) {
 templates[existingIndex] = newTemplate;
 }
 else {
 templates.push(newTemplate);
 }
 localStorage.setItem('shipment_templates', JSON.stringify(templates));
}
export function getStoredTemplates(): ColumnMapping[] {
 const stored = localStorage.getItem('shipment_templates');
 return stored ? JSON.parse(stored) : [];
}
export function deleteTemplate(name: string): void {
 const templates = getStoredTemplates();
 const filtered = templates.filter((t) => t.templateName !== name);
 localStorage.setItem('shipment_templates', JSON.stringify(filtered));
}
export function mapData(rows: Record<string, string>[][], mappings: {
 [key: string]: string;
}): Partial<ShipmentData>[] {
 return rows.map((row) => {
 const mapped: Record<string, any> = {};
 const rowObj: Record<string, string> = {};
 row.forEach((cell) => {
 const key = Object.keys(cell)[0];
 rowObj[key] = cell[key];
 });
 for (const [targetField, sourceHeader] of Object.entries(mappings)) {
 if (sourceHeader && rowObj[sourceHeader] !== undefined) {
 const value = rowObj[sourceHeader];
 if (targetField === 'weight') {
 mapped.weight = parseFloat(value) || 0;
 } else if (targetField === 'quantity') {
 mapped.quantity = parseInt(value, 10) || 0;
 } else {
 mapped[targetField] = value;
 }
 }
 }
 return mapped as Partial<ShipmentData>;
 });
}
