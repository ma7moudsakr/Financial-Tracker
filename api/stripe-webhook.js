const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionId, userId } = req.body || {};
  if (!sessionId || !userId) return res.status(400).json({ error: 'sessionId and userId required' });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid' || session.status === 'complete') {
      const { error } = await supabase.from('profiles').update({
        tier: 'premium',
        subscription_status: 'active',
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
      }).eq('id', userId);

      if (error) {
        console.error('Supabase update error:', error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ success: true, tier: 'premium' });
    }

    return res.status(200).json({ success: false, status: session.payment_status });
  } catch (err) {
    console.error('verify-session error:', err);
    return res.status(500).json({ error: err.message });
  }
}
