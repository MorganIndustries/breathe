Deno.serve(async (req: Request) => {
  try {
    const { emailTokenMap } = await req.json()

    if (!emailTokenMap || typeof emailTokenMap !== 'object') {
      return new Response(JSON.stringify({ error: 'emailTokenMap required' }), { status: 400 })
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'hello@mail.breathemore.co'
    let sent = 0, failed = 0

    for (const [email, token] of Object.entries(emailTokenMap as Record<string, string>)) {
      const sessionUrl = `https://breathemore.co/session?token=${token}`

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body{margin:0;padding:0;background-color:#0a0f1a;font-family:Georgia,serif}
    .wrap{max-width:480px;margin:0 auto;padding:56px 32px;text-align:center}
    .eye{font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.42em;text-transform:uppercase;color:#c8a96e;margin-bottom:10px}
    h1{color:#e8ddd0;font-weight:300;font-style:italic;font-size:34px;margin:0 0 20px;letter-spacing:0.08em}
    p{color:rgba(232,221,208,0.65);font-size:13px;line-height:1.9;margin:0 0 36px;font-family:Arial,sans-serif;font-weight:300;letter-spacing:0.04em}
    .cta{display:inline-block;border:1px solid rgba(200,169,110,0.55);color:#c8a96e;font-family:Georgia,serif;font-style:italic;font-size:17px;letter-spacing:0.14em;padding:15px 44px;text-decoration:none}
    .foot{margin-top:52px;font-family:Arial,sans-serif;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(232,221,208,0.25)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="eye">A moment of stillness</div>
    <h1>Breathemore</h1>
    <p>Your daily breathing session is ready.<br>One click to begin.</p>
    <a href="${sessionUrl}" class="cta">Begin today's session &rarr;</a>
    <div class="foot">breathemore.co</div>
  </div>
</body>
</html>`

      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: email,
          subject: 'Your breathing session is ready',
          html
        })
      })

      if (resp.ok) {
        sent++
      } else {
        console.error(`Send failed for ${email}:`, resp.status, await resp.text())
        failed++
      }
    }

    console.log(`Sent: ${sent}, failed: ${failed}`)
    return new Response(
      JSON.stringify({ success: true, sent, failed }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('send-daily-emails error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
})
