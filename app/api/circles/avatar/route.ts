import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const BUCKET = 'circle-avatars'
const MAX_BYTES = 2 * 1024 * 1024

export async function POST(request: Request) {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const circleId = formData.get('circle_id') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!circleId) return NextResponse.json({ error: 'circle_id required' }, { status: 400 })

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large (max 2 MB)' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Must be a member of this circle
  const { data: membership } = await supabase
    .from('circle_members')
    .select('circle_id')
    .eq('circle_id', circleId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this circle' }, { status: 403 })
  }

  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {})

  const ts = Date.now()
  const path = `${circleId}/${ts}.jpg`
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
    .from('circles')
    .update({ circle_avatar_url: publicUrl })
    .eq('id', circleId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Prune old files
  const { data: oldFiles } = await supabase.storage
    .from(BUCKET)
    .list(circleId, { limit: 100 })

  if (oldFiles && oldFiles.length > 1) {
    const toDelete = oldFiles
      .filter((f) => !path.endsWith(f.name))
      .map((f) => `${circleId}/${f.name}`)
    if (toDelete.length) {
      await supabase.storage.from(BUCKET).remove(toDelete).catch(() => {})
    }
  }

  return NextResponse.json({ circle_avatar_url: publicUrl })
}
