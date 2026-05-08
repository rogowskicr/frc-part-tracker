import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { nextPartNumber } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const assemblyNumber = request.nextUrl.searchParams.get('assembly');
  if (!assemblyNumber) return NextResponse.json({ number: '' });

  const supabase = await createClient();
  const yy = assemblyNumber.slice(0, 2);

  const { data } = await supabase
    .from('parts')
    .select('part_number')
    .like('part_number', `${yy}_P_%`);

  const existing = data?.map((r) => r.part_number).filter(Boolean) as string[];
  const number = nextPartNumber(assemblyNumber, existing);

  return NextResponse.json({ number });
}
