const PUBLICATION_ID = 'pub_11229946-bf64-4479-9535-19d443cb6edf'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://breathemore.co',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const resp = await fetch(
      `https://api.beehiiv.com/v2/publications/${PUBLICATION_ID}/subscriptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('BEEHIIV_API_KEY')}`,
        },
        body: JSON.stringify({ email, send_welcome_email: true }),
      }
    )

    if (!resp.ok) {
      console.error('Beehiiv error:', await resp.text())
    }

  } catch (err) {
    console.error('subscribe-to-beehiiv error:', err)
  }

  // Always return success — a Beehiiv failure should never block signup
  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
