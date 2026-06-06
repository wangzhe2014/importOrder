import os
import sys

pdf_path = os.path.join(os.path.dirname(__file__), '..', 'demos', '黔寨寨贵州烙锅（鞍山店）常温.pdf')

print(f"PDF Path: {pdf_path}")
print(f"Python Version: {sys.version}")

try:
    import pypdf
    print("pypdf is installed")
    reader = pypdf.PdfReader(pdf_path)
    print(f"Number of pages: {len(reader.pages)}")
    for i, page in enumerate(reader.pages):
        print(f"--- PAGE {i} ---")
        print(page.extract_text()[:1000])
except ImportError:
    print("pypdf is NOT installed")
    try:
        import pdfplumber
        print("pdfplumber is installed")
        with pdfplumber.open(pdf_path) as pdf:
            print(f"Number of pages: {len(pdf.pages)}")
            for i, page in enumerate(pdf.pages):
                print(f"--- PAGE {i} ---")
                print(page.extract_text()[:1000])
    except ImportError:
        print("pdfplumber is NOT installed")
        # Try to install pypdf
        print("Attempting to run a script that extracts pdf text...")
