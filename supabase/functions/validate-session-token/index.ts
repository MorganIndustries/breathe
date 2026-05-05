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

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { token } = await req.json()

    if (!token || typeof token !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Token required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from('email_tokens')
      .select('id, user_id, expires_at, used')
      .eq('token', token)
      .single()

    if (tokenError || !tokenRecord) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (tokenRecord.used) {
      return new Response(
        JSON.stringify({ error: 'Token already used' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (new Date(tokenRecord.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Token expired' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { error: updateError } = await supabaseAdmin
      .from('email_tokens')
      .update({ used: true })
      .eq('id', tokenRecord.id)

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to validate token' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(tokenRecord.user_id)

    if (userError || !userData?.user) {
      console.error('getUserById error:', userError)
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: userData.user.email
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('generateLink error:', linkError)
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        otp_token: linkData.properties.hashed_token,
        email: userData.user.email
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('validate-session-token error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
