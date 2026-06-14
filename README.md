# Leads Parser

This repository converts BNC project PDF reports into structured JSON records and then exports those records to Excel.

The pipeline combines:
- Python-based PDF text extraction
- Node.js orchestration
- Groq LLM JSON extraction
- Python Excel export

---

## What this project does

The workflow is designed for batches of PDF files stored in `BNC PDFs/`.

For each input PDF, the pipeline:
1. Extracts text from the PDF using Python (`pypdf` + `pdfplumber`)
2. Sends the extracted text to the Groq API with a one-shot extraction prompt
3. Writes the structured result to `Output JSON/`
4. Saves a text copy of the extracted PDF content to `Output Text files/`
5. Builds an Excel workbook from the generated JSON records

This is useful when you need to turn many BNC lead/project PDFs into a spreadsheet-ready dataset.

---

## Repository structure

- `parse_pdf.js` — main orchestration script that runs the full pipeline
- `llm_text_to_json.js` — calls Groq, parses JSON output, and writes the final files
- `extract_bnc_pdf_text.py` — extracts text from each PDF using two PDF libraries
- `json_to_excel.py` — converts all JSON files in `Output JSON/` into `leads_export.xlsx`
- `BNC_PDF_Extraction_Prompt.md` — human-readable prompt used for the LLM extraction task
- `BNC PDFs/` — input PDF folder
- `Output Text files/` — raw extracted text copies
- `Output JSON/` — extracted structured JSON records
- `parse.cmd` — Windows launcher for the Node pipeline
- `.env` — stores the Groq API key

---

## End-to-end pipeline

### 1) PDF text extraction
The first stage is handled by `extract_bnc_pdf_text.py`.

It:
- reads each PDF file from `BNC PDFs/`
- extracts text with `pdfplumber`
- extracts text again with `pypdf`
- combines both outputs
- cleans the text (line breaks, spacing, character normalization)
- prints extraction stats to stderr

This stage produces the text that will be sent to the LLM.

### 2) LLM-based extraction
The second stage is handled by `llm_text_to_json.js`.

It:
- loads the extracted text
- builds a prompt using the rules in `BNC_PDF_Extraction_Prompt.md`
- calls Groq using the configured model
- attempts to parse the returned JSON
- retries with a repair prompt if the first response is malformed

The result should be a JSON array of lead/project records.

### 3) Output file generation
For each PDF, the pipeline writes:
- `Output Text files/<PDF name>.txt` — extracted raw text
- `Output JSON/<PDF name>.json` — structured lead data

### 4) Excel export
The final stage is handled by `json_to_excel.py`.

It:
- loads every JSON file in `Output JSON/`
- merges all records into one table
- writes `Output JSON/leads_export.xlsx`

---

## Prerequisites

### Node.js
Install Node.js and npm.

### Python
This project expects a Python virtual environment at:
- `.venv/Scripts/python.exe`

The Python dependencies used by the project are:
- `ftfy`
- `pypdf`
- `pdfplumber`
- `pandas`
- `openpyxl`

### Groq API key
Create or update `.env` with a valid key:

```env
GROQ_API_KEY=your_key_here
```

The code also accepts `QROK_API_KEY` as a fallback name.

---

## Setup

### 1) Install Node dependencies
From the project root:

```bash
npm install
```

### 2) Install Python dependencies
If your `.venv` is already available, install the required packages with:

```bash
.\.venv\Scripts\python.exe -m pip install ftfy pypdf pdfplumber pandas openpyxl
```

If the environment is not present yet, create it first and then install the packages.

---

## How to run the full pipeline

### Option A — using npm

```bash
npm run parse
```

This runs the main orchestrator in `parse_pdf.js`.

### Option B — using the Windows wrapper

```cmd
parse.cmd
```

### Option C — direct Node execution

```bash
node parse_pdf.js
```

### Optional: export to Excel only
If you already have JSON outputs and only want the spreadsheet:

```bash
.\.venv\Scripts\python.exe json_to_excel.py
```

---

## Expected behavior

When the pipeline starts, it scans `BNC PDFs/` and only processes PDFs that do not yet have a matching JSON file in `Output JSON/`.

That means:
- first run: all PDFs are processed
- later runs: already-generated outputs are skipped

If you want to force a re-run for a specific file or all files, remove the corresponding JSON output first.

---

## Output files

### Input
- `BNC PDFs/*.pdf`

### Generated text files
- `Output Text files/*.txt`

### Generated JSON files
- `Output JSON/*.json`

### Generated Excel file
- `Output JSON/leads_export.xlsx`

---

## Notes about the current implementation

- The Node script uses the Python virtual environment for the PDF extraction and Excel export stages.
- The LLM extraction stage depends on a valid Groq API key in `.env`.
- The pipeline writes both text and JSON outputs for traceability.
- The extracted JSON structure is produced by the LLM response and may vary slightly depending on the model output.

---

## Troubleshooting

### Missing Groq API key
If you see an error about a missing API key:
- verify that `.env` exists
- confirm that `GROQ_API_KEY` is set
- restart the terminal after changing `.env`

### Python extraction fails
If the PDF extraction step fails:
- confirm `.venv` exists
- reinstall the Python packages listed above
- ensure the PDF path is valid

### Excel export fails
If the Excel export step fails:
- make sure `Output JSON/` contains at least one valid JSON file
- verify `pandas` and `openpyxl` are installed in the Python environment

---

## Summary

This repository is a small batch-processing pipeline for BNC PDF lead reports:

PDF → text extraction → Groq JSON extraction → JSON storage → Excel export

It is best suited for running repeatedly on a folder of BNC PDFs and producing a spreadsheet-ready result set.
