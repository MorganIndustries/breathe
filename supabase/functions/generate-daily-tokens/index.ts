import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

Deno.serve(async (req) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    })

    if (usersError) {
      console.error('Error listing users:', usersError)
      return new Response(JSON.stringify({ error: 'Failed to list users' }), { status: 500 })
    }

    const { data: streaks } = await supabaseAdmin
      .from('streaks')
      .select('user_id, unsubscribed, unsubscribe_token')

    const prefMap = {}
    if (streaks) {
      streaks.forEach(s => { prefMap[s.user_id] = s })
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = 'Breathemore <' + (Deno.env.get('RESEND_FROM_EMAIL') || 'hello@breathemore.co') + '>'
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    let sent = 0, failed = 0, skipped = 0

    for (const user of users) {
      if (!user.email) continue

      const prefs = prefMap[user.id]

      if (prefs?.unsubscribed) {
        skipped++
        continue
      }

      let unsubToken = prefs?.unsubscribe_token
      if (!unsubToken) {
        unsubToken = Array.from(crypto.getRandomValues(new Uint8Array(24)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
        await supabaseAdmin
          .from('streaks')
          .upsert({ user_id: user.id, unsubscribe_token: unsubToken }, { onConflict: 'user_id' })
      }

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

      const sessionUrl = `https://breathemore.co/session?token=${token}`
      const unsubUrl = `https://asdkskkhsupbqkhwcbun.supabase.co/functions/v1/unsubscribe?token=${unsubToken}`

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body{margin:0;padding:0;background-color:#0a0f1a;font-family:Georgia,serif}
    .wrap{max-width:480px;margin:0 auto;padding:56px 32px;text-align:center}
    .eye{font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.42em;text-transform:uppercase;color:#c8a96e;margin-bottom:10px}
    h1{color:#f0e8de;font-weight:300;font-style:italic;font-size:34px;margin:0 0 20px;letter-spacing:0.08em}
    p{color:#ddd4c8;font-size:14px;line-height:1.9;margin:0 0 36px;font-family:Arial,sans-serif;font-weight:300;letter-spacing:0.04em}
    .cta{display:inline-block;border:1px solid rgba(200,169,110,0.75);color:#c8a96e;font-family:Georgia,serif;font-style:italic;font-size:17px;letter-spacing:0.14em;padding:15px 44px;text-decoration:none}
    .foot{margin-top:52px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(232,221,208,0.5)}
    .unsub{margin-top:20px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.15em;color:rgba(232,221,208,0.55)}
    .unsub a{color:rgba(232,221,208,0.55)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="eye">A moment of stillness</div>
    <h1>Breathemore</h1>
    <p>Two minutes of calm are waiting for you.<br>One click to begin.</p>
    <a href="${sessionUrl}" class="cta">Begin today's session &rarr;</a>
    <div class="foot">breathemore.co</div>
    <div class="unsub"><a href="${unsubUrl}">Unsubscribe</a></div>
  </div>
</body>
</html>`

      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({ from: fromEmail, to: user.email, subject: 'Your two minutes of calm', html })
      })

      if (resp.ok) {
        sent++
      } else {
        console.error(`Send failed for ${user.email}:`, resp.status, await resp.text())
        failed++
      }

      await delay(100)
    }

    console.log(`Sent: ${sent}, failed: ${failed}, skipped: ${skipped}`)
    return new Response(
      JSON.stringify({ success: true, sent, failed, skipped }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('generate-daily-tokens error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
})
