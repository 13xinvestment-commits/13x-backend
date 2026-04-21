// pipeline/extractor.js
const fetch = require('node-fetch');

const GEMINI_URL = () =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

async function extractTriggers(transcriptText, companyName) {
  if (!transcriptText || transcriptText.length < 100) return null;

  const prompt = `You are an investment research AI for Indian listed companies.
Extract forward-looking growth triggers from this earnings call transcript.

Company: ${companyName}

Transcript:
${transcriptText.slice(0, 5000)}

Return ONLY valid JSON, no markdown, no explanation, no backticks:
{
  "top_trigger": "single most important forward-looking statement from management",
  "all_triggers": ["trigger 1", "trigger 2", "trigger 3", "trigger 4"],
  "catalyst_tags": ["capex"],
  "score": 4,
  "stage": "early_growth"
}

Rules:
- catalyst_tags must only use values from: capex, margin_expansion, geographic_expansion, new_products, acquisitions, operating_leverage
- stage must only be one of: early_growth, acceleration, maturity, decline
- score must be a whole number from 0 to 5`;

  try {
    const res = await fetch(GEMINI_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
      })
    });

    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!raw) return null;

    // Remove accidental markdown backticks if any
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);

  } catch (err) {
    console.error(`Extraction error for ${companyName}:`, err.message);
    return null;
  }
}

module.exports = { extractTriggers };
