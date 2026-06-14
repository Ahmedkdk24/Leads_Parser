import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const OUTPUT_TEXT_DIR = path.resolve('Output Text files');
const OUTPUT_JSON_DIR = path.resolve('Output JSON');

const LLM_LEAD_ONE_SHOT_PROMPT = `
You are a data extraction assistant. You will be given the text content of one BNC Construction Intelligence project report. Your job is to extract specific fields from the project and return them as a JSON array — one object per project.

Extract the following fields for each project:

JSON Key: name
Source in PDF: Project title (top of report)
Notes: Full name including location suffix

JSON Key: description
Source in PDF: "Description" section
Notes: Plain text only, strip all HTML tags

JSON Key: partner_name
Source in PDF: Owner company under "Companies" section
Notes: The company listed with Role: "Corporation Owner" or "Operator Owner"

JSON Key: contact_name
Source in PDF: Owner's contact person
Notes: Name listed under the owner company's "Contacts" field

JSON Key: function
Source in PDF: Owner contact's job title
Notes: e.g. "Business Development Manager"

JSON Key: phone_mobile_search
Source in PDF: Owner company's Office No.
Notes: Use the office phone number of the owner

JSON Key: mobile
Source in PDF: Owner contact's direct mobile
Notes: If separately listed; otherwise leave blank

JSON Key: street
Source in PDF: Project address
Notes: District/suburb portion of the location line

JSON Key: city
Source in PDF: Project city
Notes: City portion of the location (e.g. Riyadh, Dammam)

JSON Key: stage_id
Source in PDF: Always set to "New"
Notes: Static value for all records

Rules:

- If a field is not found in the PDF, set its value to null.
- Strip all HTML tags from text fields.
- For phone numbers, preserve the full number including country code (e.g. +966-13-8555000).
- Do not invent or infer values — only extract what is explicitly stated.
- Return a JSON array even if only one project is provided.
- Do not include any explanation or text outside the JSON array.

Output format:

[
  {
    "name": "",
    "description": "",
    "partner_name": "",
    "contact_name": "",
    "function": "",
    "mobile": "",
    "street": "",
    "city": "",
    "expected_revenue": "",
    "stage_id": "New",
    "project_type": ""
  }
]

Now extract data from the following BNC project PDF text:
`;


function estimateTokens(text) {
  const value = typeof text === 'string' ? text : String(text ?? '');
  return Math.max(1, Math.ceil(value.length / 4));
}

export async function extractLeadData(pdfText) {
  const apiKey = process.env.GROQ_API_KEY || process.env.QROK_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GROQ API key. Set GROQ_API_KEY (or QROK_API_KEY) in your environment.');
  }

  const groq = new Groq({ apiKey });

  const promptText = `${LLM_LEAD_ONE_SHOT_PROMPT}\n\n${pdfText}`;
  const messages = [
    {
      role: 'user',
      content: promptText
    }
  ];

  console.log(`[GROK-STATS] pdf_characters=${pdfText.length} estimated_tokens=${estimateTokens(pdfText)}`);
  console.log(`[GROK-STATS] prompt_characters=${promptText.length} estimated_tokens=${estimateTokens(promptText)}`);

  try {
    const completion = await groq.chat.completions.create({
      messages,
      model: MODEL,
      temperature: 0
    });

    const rawText = completion.choices?.[0]?.message?.content || '';
    console.log(`[GROK-STATS] response_characters=${rawText.length} estimated_tokens=${estimateTokens(rawText)}`);
    const parsed = parseJson(rawText);
    if (parsed) return parsed;

    console.log('JSON parse failed. Triggering repair step...');

    const repairCompletion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: 'Convert the following text into valid JSON only. No explanation.' },
        { role: 'user', content: rawText }
      ]
    });

    const repairedText = repairCompletion.choices?.[0]?.message?.content || '';
    const repairedParsed = parseJson(repairedText);
    if (repairedParsed) return repairedParsed;

    throw new Error('Failed to parse JSON even after repair step.');
  } catch (error) {
    console.error('Groq extraction pipeline failed:', error);
    throw error;
  }
}

export function extractLeadDataFromFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const text = fs.readFileSync(absolutePath, 'utf8');
  return extractLeadData(text);
}

export function extractLeadDataFromPdf(pdfPath) {
  const absolutePath = path.resolve(pdfPath);
  const pythonExecutable = path.resolve('.venv', 'Scripts', 'python.exe');
  const baseName = path.basename(absolutePath, path.extname(absolutePath));
  const textOutputPath = path.join(OUTPUT_TEXT_DIR, `${baseName}.txt`);
  const jsonOutputPath = path.join(OUTPUT_JSON_DIR, `${baseName}.json`);

  fs.mkdirSync(OUTPUT_TEXT_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_JSON_DIR, { recursive: true });

  const extraction = spawnSync(
    pythonExecutable,
    ['extract_bnc_pdf_text.py', absolutePath],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: Infinity
    }
  );

  if (extraction.error) {
    throw extraction.error;
  }

  if (extraction.status !== 0) {
    throw new Error(`Python extraction failed with status ${extraction.status}: ${extraction.stderr || 'Unknown error'}`);
  }

  const extractedText = extraction.stdout || '';
  if (extraction.stderr) {
    console.error(extraction.stderr.trim());
  }

  console.log(`[PIPELINE] extracted_text_characters=${extractedText.length} estimated_tokens=${estimateTokens(extractedText)}`);

  fs.writeFileSync(textOutputPath, extractedText, 'utf8');
  const writtenBytes = fs.statSync(textOutputPath).size;
  console.log(`[FILE-STATS] text_file_characters=${extractedText.length} bytes=${writtenBytes} path=${textOutputPath}`);

  return extractLeadData(extractedText).then((result) => {
    fs.writeFileSync(jsonOutputPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`[FILE-STATS] json_file_characters=${fs.statSync(jsonOutputPath).size} path=${jsonOutputPath}`);
    return result;
  });
}

function parseJson(text) {
  const clean = text.replace(/```json/g, '').replace(/```/g, '').replace(/`/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch {}

  const openChars = ['[', '{'];
  const closeChars = [']', '}'];

  for (let s = 0; s < clean.length; s++) {
    const openChar = clean[s];
    const openIndex = openChars.indexOf(openChar);
    if (openIndex === -1) continue;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = s; i < clean.length; i++) {
      const ch = clean[i];

      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === openChars[openIndex]) depth++;
      else if (ch === closeChars[openIndex]) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(clean.slice(s, i + 1));
          } catch {}
          break;
        }
      }
    }
  }

  return null;
}