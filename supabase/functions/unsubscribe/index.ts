import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token) {
    return Response.redirect('https://breathemore.co?unsubscribed=true', 302)
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    await supabaseAdmin
      .from('streaks')
      .update({ unsubscribed: true })
      .eq('unsubscribe_token', token)

  } catch (err) {
    console.error('unsubscribe error:', err)
  }

  return Response.redirect('https://breathemore.co?unsubscribed=true', 302)
})
