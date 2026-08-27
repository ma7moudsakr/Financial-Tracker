export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { image, media_type } = req.body;
  if (!image || !media_type) return res.status(400).json({ error: 'Missing image or media_type' });
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
        max_tokens: 600,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type, data: image } },
          { type: 'text', text: `Analyze this receipt. Extract ALL monetary amounts visible. Return ONLY valid JSON no markdown:\n{"merchant":"","date":"YYYY-MM-DD","amounts":[{"label":"Subtotal","value":0},{"label":"Total","value":0}],"category":"Groceries|Transport|Housing|Phone & Internet|Travel|Family Transfer|Misc|Other","confidence":"high|medium|low"}\nIf only one amount, still return an array with one item.` }
        ]}]
      })
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
