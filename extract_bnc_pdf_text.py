import argparse
import math
import re
import sys
from pathlib import Path

import ftfy
from pypdf import PdfReader
import pdfplumber


def estimate_tokens(text: str) -> int:
    return max(1, math.ceil(len(text) / 4))


def clean_text(text: str) -> str:
    text = ftfy.fix_text(text)
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = text.replace('×', 'x').replace('−', '-').replace('©', '(c)')
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'\n +', '\n', text)
    return text.strip()


def extract_with_pypdf(pdf_path: Path) -> str:
    reader = PdfReader(str(pdf_path))
    pages = []
    for page in reader.pages:
        text = page.extract_text() or ''
        pages.append(text)
    combined = clean_text('\n\n'.join(pages))
    print(f'[PYTHON-EXTRACT] pypdf_pages={len(reader.pages)} characters={len(combined)} estimated_tokens={estimate_tokens(combined)}', file=sys.stderr)
    return combined


def extract_with_pdfplumber(pdf_path: Path) -> str:
    pages = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            text = page.extract_text(layout=True) or page.extract_text() or ''
            if not text.strip():
                words = page.extract_words(x_tolerance=3, y_tolerance=3, keep_blank_chars=False)
                if words:
                    grouped = {}
                    for w in words:
                        key = round(w['top'] / 3) * 3
                        grouped.setdefault(key, []).append(w)
                    lines = [' '.join(sorted(grouped[k], key=lambda x: x['x0'])[-1]['text'] if False else item['text'] for item in sorted(grouped[k], key=lambda x: x['x0'])) for k in sorted(grouped)]
                    text = '\n'.join(lines)
            pages.append(text)
    combined = clean_text('\n\n'.join(pages))
    print(f'[PYTHON-EXTRACT] pdfplumber_pages={len(pdf.pages)} characters={len(combined)} estimated_tokens={estimate_tokens(combined)}', file=sys.stderr)
    return combined


def extract_text(pdf_path: Path) -> str:
    plumber_text = extract_with_pdfplumber(pdf_path)
    pypdf_text = extract_with_pypdf(pdf_path)
    combined = clean_text('\n\n'.join(part for part in (plumber_text, pypdf_text) if part.strip()))
    print(f'[PYTHON-EXTRACT] combined_characters={len(combined)} estimated_tokens={estimate_tokens(combined)}', file=sys.stderr)
    return combined


def main() -> None:
    parser = argparse.ArgumentParser(description='Extract text from a BNC PDF file.')
    parser.add_argument('pdf', help='Path to the PDF file to extract text from.')
    parser.add_argument('-o', '--output', help='Optional output text file path.')
    args = parser.parse_args()

    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    pdf_path = Path(args.pdf).expanduser().resolve()
    if not pdf_path.exists():
        print(f'File not found: {pdf_path}', file=sys.stderr)
        sys.exit(1)

    text = extract_text(pdf_path)

    if args.output:
        out_path = Path(args.output).expanduser().resolve()
        out_path.write_text(text, encoding='utf-8')
        print(f'Extracted text saved to: {out_path}')
    else:
        print(text)


if __name__ == '__main__':
    main()
