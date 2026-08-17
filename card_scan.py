"""
card_scan.py — Turns a photographed business card into structured contact
fields (name, role, company, phone, email).

Groq doesn't currently expose a vision-capable model on this account
(checked live against the account's actual model list before building
this - no vision model, and groq/compound rejects image content). So
this OCRs the image locally with Tesseract (pytesseract) instead of
sending the image to an LLM, then structures the OCR'd text with the
same shared Groq TEXT client (llm_client.py) used everywhere else in
this project - a small, purpose-built prompt rather than repurposing
extraction.py's conversation-note extractor, since a business card isn't
a narrated conversation.

Requires the Tesseract OCR binary on the machine running this (not just
the `pytesseract` pip package, which is only a wrapper around it):
    macOS:  brew install tesseract
    Linux:  apt install tesseract-ocr
"""

import json
from io import BytesIO

import pytesseract
from PIL import Image

from llm_client import get_client, MODEL_NAME


def _ocr_image(image_bytes: bytes) -> str:
    image = Image.open(BytesIO(image_bytes))
    return pytesseract.image_to_string(image)


def _structure_card_text(raw_text: str) -> dict:
    system_prompt = """You are extracting contact details from OCR'd business card text.
The text may contain OCR noise, extra whitespace/line breaks, or artifacts from a logo -
ignore those. Return ONLY valid JSON matching this schema:
{
  "name": "string - the person's full name, or empty string if unclear",
  "role": "string - their job title, or empty string if not present",
  "company": "string - their company/organization, or empty string if not present",
  "phone": "string - their phone number, or empty string if not present",
  "email": "string - their email address, or empty string if not present"
}
If the card lists multiple phone numbers, pick the one that looks primary (e.g. labeled
"mobile"/"cell", or listed first). Do not invent anything not present in the text."""

    client = get_client()
    response = client.chat.completions.create(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": raw_text},
        ],
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content
    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Card structuring did not return valid JSON. Raw output:\n{content}") from e


def extract_business_card(image_bytes: bytes) -> dict:
    """
    OCRs a business card photo and structures it into
    {name, role, company, phone, email} (all strings, empty if not found).
    Raises ValueError if OCR finds no text at all, or if structuring fails.
    """
    raw_text = _ocr_image(image_bytes)
    if not raw_text or not raw_text.strip():
        raise ValueError("Couldn't read any text from that image - try a clearer photo.")
    return _structure_card_text(raw_text)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python card_scan.py <path_to_image>")
    else:
        with open(sys.argv[1], "rb") as f:
            result = extract_business_card(f.read())
        print(json.dumps(result, indent=2))
