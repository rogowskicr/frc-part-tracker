import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { testConnection } from '@/lib/onshape/client';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let access_key: string, secret_key: string;
    try {
      const body = await request.json();
      access_key = body.access_key;
      secret_key = body.secret_key;
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!access_key || !secret_key) {
      return NextResponse.json({ error: 'access_key and secret_key are required' }, { status: 400 });
    }

    const result = await testConnection({ accessKey: access_key, secretKey: secret_key });

    return NextResponse.json({ success: true, document_count: result.documentCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection test failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
