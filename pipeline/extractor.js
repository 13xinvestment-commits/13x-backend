const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');

// Check for API Keys
if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
  console.warn('[extractor] Warning: Neither GROQ_API_KEY nor GEMINI_API_KEY is defined in environment variables.');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');

// Define Structured Schema for response validation (Gemini mode)
const schema = {
  type: "object",
  properties: {
    company: {
      type: "object",
      properties: {
        top_trigger: { type: "string" },
        catalyst_tags: {
          type: "array",
          items: { type: "string" }
        },
        score: { type: "integer" },
        stage: { type: "string" }
      },
      required: ["top_trigger", "catalyst_tags", "score", "stage"]
    },
    triggers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          trigger_text: { type: "string" },
          catalyst_type: { type: "string" },
          conviction_score: { type: "integer" },
          source_quote: { type: "string" }
        },
        required: ["trigger_text", "catalyst_type", "conviction_score", "source_quote"]
      }
    },
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          signal_type: { type: "string" },
          content: { type: "string" },
          confidence: { type: "integer" },
          source: { type: "string" }
        },
        required: ["signal_type", "content", "confidence", "source"]
      }
    },
    snapshot: {
      type: "object",
      properties: {
        revenue_trend: { type: "string" },
        margin_trend: { type: "string" },
        tone: { type: "string" },
        guidance_summary: { type: "string" },
        capex_commentary: { type: "string" },
        risks: { type: "string" },
        key_quotes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              speaker: { type: "string" }
            },
            required: ["text", "speaker"]
          }
        }
      },
      required: ["revenue_trend", "margin_trend", "tone", "guidance_summary", "capex_commentary", "risks", "key_quotes"]
    }
  },
  required: ["company", "triggers", "signals", "snapshot"]
};

/**
 * Extracts structured data from transcript text using the Groq API (Llama-3.3-70b-versatile).
 * @private
 */
async function extractUsingGroq(prompt, modelName = 'llama-3.3-70b-versatile') {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not defined in environment variables.');
  }

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      console.log(`[extractor] Querying Groq API using model: ${modelName} (attempt ${attempt + 1}/${maxRetries})...`);
      
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          response_format: {
            type: 'json_object'
          },
          temperature: 0.1
        }),
        timeout: 30000
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || '';
        const isRateLimit = res.status === 429 || errorMessage.toLowerCase().includes('rate limit');
        
        if (isRateLimit && attempt + 1 < maxRetries) {
          attempt++;
          let delayMs = 30000;
          const match = errorMessage.match(/try again in ([\d\.]+)s/);
          if (match) {
            delayMs = Math.ceil(parseFloat(match[1]) * 1000) + 2000;
          }
          console.warn(`[extractor] Groq rate limit hit. Sleeping for ${delayMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        throw new Error(`Groq API error (${res.status}): ${JSON.stringify(errorData)}`);
      }

      const responseJson = await res.json();
      const rawText = responseJson.choices?.[0]?.message?.content;
      if (!rawText) {
        throw new Error('Groq returned an empty response.');
      }

      return JSON.parse(rawText);
    } catch (err) {
      const isRateLimitException = err.message.includes('429') || err.message.toLowerCase().includes('rate limit');
      if (isRateLimitException && attempt + 1 < maxRetries) {
        attempt++;
        let delayMs = 30000;
        const match = err.message.match(/try again in ([\d\.]+)s/);
        if (match) {
          delayMs = Math.ceil(parseFloat(match[1]) * 1000) + 2000;
        }
        console.warn(`[extractor] Groq rate limit exception. Sleeping for ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Extracts structured data from transcript text using the Gemini API.
 * @private
 */
async function extractUsingGemini(prompt, companyName) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.1,
    }
  });

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      console.log(`[extractor] Requesting Gemini analysis (attempt ${attempt + 1}/${maxRetries})...`);
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      return JSON.parse(responseText);
    } catch (err) {
      attempt++;
      const isRateLimit = err.message.includes('429') || err.message.includes('Quota exceeded');
      if (isRateLimit && attempt < maxRetries) {
        let delayMs = 45000;
        const match = err.message.match(/Please retry in ([\d\.]+)s/);
        if (match) {
          delayMs = Math.ceil(parseFloat(match[1]) * 1000) + 2000;
        }
        console.warn(`[extractor] Gemini rate limit hit. Sleeping for ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Parses and extracts structured investment metrics from raw transcript text.
 * Prefers Groq if GROQ_API_KEY is defined, otherwise falls back to Gemini.
 * 
 * @param {string} transcriptText - Full text of the earnings call transcript
 * @param {string} companyName - Name of the target company
 * @param {string} quarter - Target quarter of the transcript (e.g. Q4FY26)
 * @returns {Promise<object>} - Clean validated JSON containing company, triggers, signals, and snapshot data
 */
async function extractFinancialIntel(transcriptText, companyName, quarter) {
  if (!transcriptText || transcriptText.length < 100) {
    throw new Error('Transcript text is too short or empty.');
  }

  // Optimize token usage
  const truncatedText = transcriptText.slice(0, 12000);

  const prompt = `You are a financial analyst specializing in Indian listed companies.
Analyze the provided earnings call transcript for ${companyName} for the quarter ${quarter}.

Extract the following intelligence matching the requested schema rules:

1. COMPANY CORE SUMMARY:
   - top_trigger: The single most important forward-looking catalyst or statement mentioned by management.
   - catalyst_tags: Classification tags. Choose ONLY from: capex, margin_expansion, geographic_expansion, new_products, acquisitions, operating_leverage, risk, guidance, expansion, policy.
   - score: A score from 0 to 5 reflecting how strong the positive catalysts are (5 being outstanding growth profile, 0 being distressed).
   - stage: Business growth stage. Choose ONLY from: early_growth, acceleration, maturity, decline.

2. GROWTH TRIGGERS (up to 4 items):
   - trigger_text: Concise description of a key growth driver.
   - catalyst_type: Standardized category tag from: capex, margin_expansion, geographic_expansion, new_products, acquisitions, operating_leverage.
   - conviction_score: Scale 1 to 5.
   - source_quote: Direct management quote supporting this trigger.

3. MANAGEMENT SIGNALS:
   - signal_type: Choose ONLY from: guidance, capex, margin, expansion, acquisition, risk.
   - content: Summary of the signal.
   - confidence: Scale 1 to 5.
   - source: Cite where this was mentioned (e.g. "${quarter} Earnings Call").

4. CONCALL SNAPSHOT:
   - revenue_trend: Choose ONLY from: up, down, stable.
   - margin_trend: Choose ONLY from: up, down, stable.
   - tone: Choose ONLY from: positive, neutral, cautious.
   - guidance_summary: Clear description of management guidance on growth/margins.
   - capex_commentary: Details about capital expenditures. If none, write "N/A".
   - risks: Summary of headwinds/risks described by management.
   - key_quotes: Direct quote blocks (text and speaker name).

You MUST return ONLY valid JSON output matching this strict schema structure:
{
  "company": {
    "top_trigger": "string",
    "catalyst_tags": ["string"],
    "score": number,
    "stage": "string"
  },
  "triggers": [
    {
      "trigger_text": "string",
      "catalyst_type": "string",
      "conviction_score": number,
      "source_quote": "string"
    }
  ],
  "signals": [
    {
      "signal_type": "string",
      "content": "string",
      "confidence": number,
      "source": "string"
    }
  ],
  "snapshot": {
    "revenue_trend": "string",
    "margin_trend": "string",
    "tone": "string",
    "guidance_summary": "string",
    "capex_commentary": "string",
    "risks": "string",
    "key_quotes": [
      {
        "text": "string",
        "speaker": "string"
      }
    ]
  }
}

Here is the transcript text:
---
${truncatedText}
---
`;

  let parsedData;
  if (process.env.GROQ_API_KEY) {
    try {
      parsedData = await extractUsingGroq(prompt, 'llama-3.3-70b-versatile');
    } catch (err) {
      console.warn(`[extractor] Groq 70b extraction failed: ${err.message}. Trying Groq 8b fallback...`);
      try {
        parsedData = await extractUsingGroq(prompt, 'llama-3.1-8b-instant');
      } catch (err8b) {
        console.warn(`[extractor] Groq 8b extraction failed: ${err8b.message}. Falling back to Gemini...`);
        if (process.env.GEMINI_API_KEY) {
          parsedData = await extractUsingGemini(prompt, companyName);
        } else {
          throw err8b;
        }
      }
    }
  } else if (process.env.GEMINI_API_KEY) {
    parsedData = await extractUsingGemini(prompt, companyName);
  } else {
    throw new Error('No valid API keys found (neither GROQ_API_KEY nor GEMINI_API_KEY is defined).');
  }

  // Ensure quarter is set on all signals
  if (parsedData.signals) {
    parsedData.signals.forEach(s => s.quarter = quarter);
  }
  // Ensure quarter is set on key quotes
  if (parsedData.snapshot && parsedData.snapshot.key_quotes) {
    parsedData.snapshot.key_quotes.forEach(q => q.quarter = quarter);
  }

  return parsedData;
}

module.exports = { extractFinancialIntel };
