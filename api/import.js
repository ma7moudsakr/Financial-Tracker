export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { rows, categories, today } = req.body;
  if (!rows || !rows.length) return res.status(400).json({ error: 'No rows provided' });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: `Parse these expense entries. Each may be structured or freeform. Extract what you can.\n\nEntries:\n${rows.join('\n')}\n\nAvailable categories: ${categories.join(', ')}\n\nReturn ONLY valid JSON array no markdown:\n[{"desc":"description","amount":0,"category":"best match","date":"YYYY-MM-DD or empty","confidence":"high|medium|low"}]\n\nToday: ${today}` }]
      })
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
