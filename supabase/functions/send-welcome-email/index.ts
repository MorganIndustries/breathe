import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://breathemore.co',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id, email } = await req.json()

    if (!user_id || !email) {
      return new Response(
        JSON.stringify({ error: 'user_id and email required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { error: insertError } = await supabaseAdmin
      .from('email_tokens')
      .insert({ user_id, token, expires_at: expiresAt })

    if (insertError) {
      console.error('Token insert failed:', insertError.message)
      return new Response(JSON.stringify({ error: 'Failed to create token' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: streak } = await supabaseAdmin
      .from('streaks')
      .select('unsubscribe_token')
      .eq('user_id', user_id)
      .single()

    let unsubToken = streak?.unsubscribe_token
    if (!unsubToken) {
      unsubToken = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
      await supabaseAdmin
        .from('streaks')
        .upsert({ user_id, unsubscribe_token: unsubToken }, { onConflict: 'user_id' })
    }

    const sessionUrl = `https://breathemore.co/session?token=${token}`
    const unsubUrl = `https://asdkskkhsupbqkhwcbun.supabase.co/functions/v1/unsubscribe?token=${unsubToken}`
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = 'Breathemore <' + (Deno.env.get('RESEND_FROM_EMAIL') || 'hello@breathemore.co') + '>'

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
<body style="margin:0;padding:0;background-color:#0a0f1a">
  <div class="wrap" style="background-color:#0a0f1a">
    <div class="eye">A moment of stillness</div>
    <h1>Breathemore</h1>
    <p>You're in. Your first session is one click away — no login needed.<br>Starting tomorrow, a fresh link arrives in your inbox each morning.</p>
    <a href="${sessionUrl}" class="cta">Begin your first session &rarr;</a>
    <div class="foot">Breathemore &middot; breathemore.co</div>
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
      body: JSON.stringify({ from: fromEmail, to: email, subject: "You're in — here's your first session", html })
    })

    if (!resp.ok) {
      console.error('Send failed:', resp.status, await resp.text())
      return new Response(JSON.stringify({ error: 'Failed to send email' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('send-welcome-email error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
