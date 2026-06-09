import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const BUCKET   = 'comment-images'
const MAX_BYTES = 5 * 1024 * 1024

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file)                           return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Must be an image' }, { status: 400 })
  if (file.size > MAX_BYTES)           return NextResponse.json({ error: 'Max 5 MB' }, { status: 400 })

  const admin = createAdminClient()
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {})

  const ext    = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
  const path   = `${user.id}/${id}.${ext}`
  const buffer = await file.arrayBuffer()

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ imageUrl: publicUrl })
}
