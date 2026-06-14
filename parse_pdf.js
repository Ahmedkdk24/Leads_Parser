import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractLeadDataFromPdf } from './llm_text_to_json.js';

const pdfDir = path.resolve('BNC PDFs');
const outputDir = path.resolve('Output JSON');

function listFiles(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((entry) => entry.toLowerCase().endsWith('.pdf')) : [];
}

function getOutputName(pdfFile) {
  return `${path.basename(pdfFile, path.extname(pdfFile))}.json`;
}

function updateExcelExport() {
  const pythonExecutable = path.resolve('.venv', 'Scripts', 'python.exe');
  const exportScript = path.resolve('json_to_excel.py');

  const result = spawnSync(pythonExecutable, [exportScript], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: Infinity
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Excel export failed with status ${result.status}: ${result.stderr || 'Unknown error'}`);
  }

  if (result.stdout) {
    console.log(result.stdout.trim());
  }
}

function main() {
  const pdfFiles = listFiles(pdfDir);
  const outputFiles = fs.existsSync(outputDir) ? new Set(fs.readdirSync(outputDir).filter((entry) => entry.toLowerCase().endsWith('.json'))) : new Set();

  if (pdfFiles.length === 0) {
    console.log('No PDF files found in BNC PDFs folder.');
    return;
  }

  const missing = pdfFiles.filter((pdfFile) => !outputFiles.has(getOutputName(pdfFile)));

  if (missing.length === 0) {
    console.log('All PDF files already have matching JSON outputs. Nothing to run.');
    return;
  }

  console.log(`Found ${pdfFiles.length} PDF file(s). Running pipeline for ${missing.length} missing output file(s).`);

  const runOne = async (pdfFile) => {
    const pdfPath = path.join(pdfDir, pdfFile);
    console.log(`\nRunning pipeline for: ${pdfPath}`);
    const result = await extractLeadDataFromPdf(pdfPath);
    console.log('Pipeline completed successfully.');
    console.log('Result count:', Array.isArray(result) ? result.length : 'n/a');

    updateExcelExport();
    console.log('Excel export refreshed from the current JSON outputs.');
  };

  return missing.reduce((promise, pdfFile) => promise.then(() => runOne(pdfFile)), Promise.resolve())
    .catch((error) => {
      console.error('Pipeline failed:', error && error.message ? error.message : error);
      process.exitCode = 1;
    });
}

main();
