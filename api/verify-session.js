import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
    console.log('verify-session — status:', session.status, 'payment:', session.payment_status, 'userId:', userId);

    if (session.status === 'complete' || session.payment_status === 'paid') {
      const { error } = await supabase.from('profiles').update({
        tier: 'premium',
        subscription_status: 'active',
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
      }).eq('id', userId);

      if (error) {
        console.error('verify-session Supabase error:', error);
        return res.status(500).json({ error: error.message });
      }
      console.log('✓ verify-session upgraded user:', userId);
      return res.status(200).json({ success: true, tier: 'premium' });
    }

    return res.status(200).json({ success: false, status: session.payment_status });
  } catch (err) {
    console.error('verify-session error:', err);
    return res.status(500).json({ error: err.message });
  }
}
