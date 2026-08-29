import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const raw = await buffer(req);
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const data = event.data.object;

  if (event.type === 'checkout.session.completed') {
    const userId = data.metadata?.userId;
    const subId = data.subscription;
    if (userId && subId) {
      await supabase.from('profiles').update({
        tier: 'premium',
        stripe_customer_id: data.customer,
        stripe_subscription_id: subId,
        subscription_status: 'active'
      }).eq('id', userId);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const customerId = data.customer;
    await supabase.from('profiles')
      .update({ tier: 'free', subscription_status: 'cancelled', stripe_subscription_id: null })
      .eq('stripe_customer_id', customerId);
  }

  if (event.type === 'customer.subscription.updated') {
    const customerId = data.customer;
    const status = data.status === 'active' ? 'active' : 'inactive';
    const tier = data.status === 'active' ? 'premium' : 'free';
    await supabase.from('profiles')
      .update({ tier, subscription_status: status })
      .eq('stripe_customer_id', customerId);
  }

  res.status(200).json({ received: true });
}

async function buffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
