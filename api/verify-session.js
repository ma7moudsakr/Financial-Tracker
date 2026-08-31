const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      console.log('checkout.session.completed — userId:', userId, 'customerId:', customerId);

      if (userId) {
        const { error } = await supabase.from('profiles').update({
          tier: 'premium',
          subscription_status: 'active',
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
        }).eq('id', userId);
        if (error) console.error('Supabase update error:', error);
        else console.log('User upgraded to premium:', userId);
      } else {
        // Fallback: find user by customer email
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.email) {
          const { data: users } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', customer.email)
            .limit(1);
          if (users && users.length) {
            await supabase.from('profiles').update({
              tier: 'premium',
              subscription_status: 'active',
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
            }).eq('id', users[0].id);
            console.log('User upgraded via email fallback:', users[0].id);
          }
        }
      }
    }

    if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.paused') {
      const sub = event.data.object;
      const { error } = await supabase.from('profiles').update({
        tier: 'free',
        subscription_status: sub.status,
      }).eq('stripe_subscription_id', sub.id);
      if (error) console.error('Downgrade error:', error);
      else console.log('User downgraded:', sub.id);
    }

    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      const isActive = sub.status === 'active' || sub.status === 'trialing';
      await supabase.from('profiles').update({
        tier: isActive ? 'premium' : 'free',
        subscription_status: sub.status,
      }).eq('stripe_subscription_id', sub.id);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
