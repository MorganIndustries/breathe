import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Get all users (up to 1000)
    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    })

    if (usersError) {
      console.error('Error listing users:', usersError)
      return new Response(JSON.stringify({ error: 'Failed to list users' }), { status: 500 })
    }

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    const emailTokenMap: Record<string, string> = {}

    for (const user of users) {
      if (!user.email) continue

      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      const { error: insertError } = await supabaseAdmin
        .from('email_tokens')
        .insert({ user_id: user.id, token, expires_at: expiresAt })

      if (insertError) {
        console.error(`Token insert failed for ${user.email}:`, insertError.message)
        continue
      }

      emailTokenMap[user.email] = token
    }

    console.log(`Generated ${Object.keys(emailTokenMap).length} tokens`)

    // Hand off to send-daily-emails
    const sendResp = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-daily-emails`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ emailTokenMap })
      }
    )

    if (!sendResp.ok) {
      console.error('send-daily-emails failed:', await sendResp.text())
    }

    return new Response(
      JSON.stringify({ success: true, count: Object.keys(emailTokenMap).length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('generate-daily-tokens error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
})
