import "dotenv/config";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

// 🧠 AI function (Gemini — FIXED)
async function runAI(text) {
  try {
    const MODEL = "gemini-2.0-flash";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
You are a financial analyst.

From this earnings call transcript, extract:

1. summary (max 3 lines)
2. bullish signals (array)
3. bearish signals (array)
4. key numbers (array)
5. management quotes (array)

Return ONLY valid JSON.

Transcript:
${text.slice(0, 15000)}
`,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    console.log("\n==== RAW AI RESPONSE ====\n");
    console.log(JSON.stringify(data, null, 2));

    // ✅ Extract usable output
    const aiText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "No output";

    console.log("\n==== CLEAN AI OUTPUT ====\n");
    console.log(aiText);

  } catch (err) {
    console.error("AI ERROR:", err);
  }
}

// 📄 Main function
async function run() {
  try {
    const buffer = fs.readFileSync("./test.pdf");
    const pdfData = await pdfParse(buffer);

    console.log("\n==== PDF TEXT (first 1000 chars) ====\n");
    console.log(pdfData.text.substring(0, 1000));

    await runAI(pdfData.text);

  } catch (err) {
    console.error("ERROR:", err);
  }
}

run();