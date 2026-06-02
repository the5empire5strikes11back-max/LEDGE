import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const BUCKET = 'avatars'
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

export async function POST(request: Request) {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large (max 2 MB)' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Ensure bucket exists (idempotent — ignores duplicate error)
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {})

  // Unique path per upload so browser caches are busted automatically
  const ts = Date.now()
  const path = `${user.id}/${ts}.jpg`
  const buffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase as any)
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', user.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Clean up old avatars for this user (keep only the latest)
  const { data: oldFiles } = await supabase.storage
    .from(BUCKET)
    .list(user.id, { limit: 100 })

  if (oldFiles && oldFiles.length > 1) {
    const toDelete = oldFiles
      .filter((f) => !path.endsWith(f.name))
      .map((f) => `${user.id}/${f.name}`)
    if (toDelete.length) {
      await supabase.storage.from(BUCKET).remove(toDelete).catch(() => {})
    }
  }

  return NextResponse.json({ avatar_url: publicUrl })
}
