import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// CRITICAL: Vercel parses body by default - we need raw bytes for Stripe signature
export const config = {
  api: { bodyParser: false }
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    console.error('Missing signature or webhook secret');
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  let event;
  let rawBody;

  try {
    rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  console.log('Webhook event received:', event.type);

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      console.log('Checkout complete — userId:', userId, 'customer:', customerId, 'sub:', subscriptionId);

      const updateData = {
        tier: 'premium',
        subscription_status: 'active',
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
      };

      if (userId) {
        const { error } = await supabase.from('profiles').update(updateData).eq('id', userId);
        if (error) console.error('Supabase update error (by userId):', error);
        else console.log('✓ User upgraded by userId:', userId);
      } else {
        // Fallback: find user by customer email
        try {
          const customer = await stripe.customers.retrieve(customerId);
          if (customer.email) {
            const { data: authUsers } = await supabase.auth.admin.listUsers();
            const match = authUsers?.users?.find(u => u.email === customer.email);
            if (match) {
              const { error } = await supabase.from('profiles').update(updateData).eq('id', match.id);
              if (error) console.error('Supabase update error (by email):', error);
              else console.log('✓ User upgraded by email:', customer.email);
            } else {
              console.error('No user found with email:', customer.email);
            }
          }
        } catch (e) {
          console.error('Customer lookup failed:', e.message);
        }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const { error } = await supabase.from('profiles')
        .update({ tier: 'free', subscription_status: 'cancelled' })
        .eq('stripe_subscription_id', sub.id);
      if (error) console.error('Downgrade error:', error);
      else console.log('✓ User downgraded, sub:', sub.id);
    }

    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      const isActive = ['active', 'trialing'].includes(sub.status);
      await supabase.from('profiles')
        .update({ tier: isActive ? 'premium' : 'free', subscription_status: sub.status })
        .eq('stripe_subscription_id', sub.id);
      console.log('✓ Subscription updated:', sub.id, sub.status);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
