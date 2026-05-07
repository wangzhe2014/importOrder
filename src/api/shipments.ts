import { supabase } from '@/lib/supabase';
import { ShipmentData, ImportResult } from '@/types';

export async function createShipments(data: ShipmentData[]): Promise<ImportResult> {
  const result: ImportResult = {
    success: 0,
    failed: 0,
    failedRows: [],
  };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const { error } = await supabase
      .from('shipments')
      .insert({
        external_code: row.external_code,
        sender_name: row.sender_name,
        sender_phone: row.sender_phone,
        sender_address: row.sender_address,
        receiver_name: row.receiver_name,
        receiver_phone: row.receiver_phone,
        receiver_address: row.receiver_address,
        weight: row.weight,
        quantity: row.quantity,
        temperature: row.temperature,
        remark: row.remark,
      });

    if (error) {
      result.failed++;
      result.failedRows.push(i);
    } else {
      result.success++;
    }
  }

  return result;
}

export async function getShipments(page: number, limit: number, filters?: {
  external_code?: string;
  receiver_name?: string;
  start_date?: string;
  end_date?: string;
}): Promise<{ data: ShipmentData[]; total: number }> {
  let query = supabase
    .from('shipments')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (filters?.external_code) {
    query = query.ilike('external_code', `%${filters.external_code}%`);
  }

  if (filters?.receiver_name) {
    query = query.ilike('receiver_name', `%${filters.receiver_name}%`);
  }

  if (filters?.start_date) {
    query = query.gte('created_at', filters.start_date);
  }

  if (filters?.end_date) {
    query = query.lte('created_at', filters.end_date);
  }

  const { data, count } = await query;

  return {
    data: data || [],
    total: count || 0,
  };
}

export async function checkDuplicateCodes(codes: string[]): Promise<string[]> {
  if (codes.length === 0) return [];

  const { data } = await supabase
    .from('shipments')
    .select('external_code')
    .in('external_code', codes.filter(Boolean));

  return data?.map((row) => row.external_code) || [];
}

export async function deleteShipment(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('shipments')
    .delete()
    .eq('id', id);

  return !error;
}
