"""
scripts/demo_documents.py — Generates obviously-fake sample documents for
testing the document organizer: ID-card style images, multi-page PDFs
(statements, contracts, decks), a passport-style photo and a .docx.

Everything is drawn from scratch with Pillow - no real templates, emblems
or logos - and every file carries a "SAMPLE - NOT A REAL DOCUMENT"
watermark with masked numbers, so nothing here could pass for a genuine
ID. Used by scripts/seed_documents.py; can also dump files to disk to try
the real upload flow:

    .venv/bin/python scripts/demo_documents.py personal ~/Desktop/sample-docs
"""

import io
import os
import sys
import zipfile
from datetime import date, timedelta

from PIL import Image, ImageDraw, ImageFont

WATERMARK = "SAMPLE · NOT A REAL DOCUMENT"


def d(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


def pretty(iso: str) -> str:
    return date.fromisoformat(iso).strftime("%d %b %Y")


def font(size: int, bold: bool = False):
    for path in (["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf",
                  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"] if bold else
                 ["/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf",
                  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def _watermark(img: Image.Image, opacity: int = 46) -> Image.Image:
    w, h = img.size
    layer = Image.new("RGBA", (w * 2, h * 2), (0, 0, 0, 0))
    dr = ImageDraw.Draw(layer)
    f = font(max(18, w // 22), bold=True)
    step = max(140, h // 4)
    for y in range(0, h * 2, step):
        dr.text((0, y), ("   " + WATERMARK) * 4, fill=(200, 40, 40, opacity), font=f)
    layer = layer.rotate(28, center=(w, h))
    layer = layer.crop((w // 2, h // 2, w // 2 + w, h // 2 + h))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def _png(img: Image.Image) -> bytes:
    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return out.getvalue()


def _jpg(img: Image.Image, q: int = 85) -> bytes:
    out = io.BytesIO()
    img.convert("RGB").save(out, "JPEG", quality=q)
    return out.getvalue()


def _thumb(img: Image.Image) -> bytes:
    t = img.copy()
    t.thumbnail((480, 480))
    return _jpg(t, 78)


def portrait(seed: int = 0, size=(600, 760)) -> Image.Image:
    """A simple illustrated head-and-shoulders on a plain background -
    passport-photo framing, clearly a drawing."""
    skins = [(224, 172, 132), (198, 140, 100), (240, 200, 165), (170, 115, 80)]
    hairs = [(40, 30, 25), (70, 45, 30), (25, 25, 30), (110, 80, 50)]
    shirts = [(40, 70, 120), (120, 40, 50), (50, 100, 80), (60, 60, 70)]
    w, h = size
    img = Image.new("RGB", size, (236, 240, 245))
    dr = ImageDraw.Draw(img)
    skin, hair, shirt = skins[seed % 4], hairs[seed % 4], shirts[seed % 4]
    dr.ellipse((w * 0.12, h * 0.70, w * 0.88, h * 1.25), fill=shirt)               # shoulders
    dr.rectangle((w * 0.42, h * 0.55, w * 0.58, h * 0.74), fill=skin)                # neck
    dr.ellipse((w * 0.27, h * 0.16, w * 0.73, h * 0.66), fill=skin)                  # face
    dr.chord((w * 0.25, h * 0.10, w * 0.75, h * 0.50), 180, 360, fill=hair)          # hair
    for ex in (0.41, 0.59):
        dr.ellipse((w * ex - 9, h * 0.40 - 6, w * ex + 9, h * 0.40 + 6), fill=(40, 30, 30))
    dr.arc((w * 0.43, h * 0.46, w * 0.57, h * 0.56), 20, 160, fill=(150, 70, 60), width=4)
    return img


def id_card(header: str, sub: str, fields: list, accent=(30, 80, 140), seed: int = 0, footer: str = "") -> tuple:
    w, h = 1012, 638
    img = Image.new("RGB", (w, h), (250, 250, 247))
    dr = ImageDraw.Draw(img)
    dr.rounded_rectangle((6, 6, w - 6, h - 6), radius=36, outline=(205, 205, 200), width=3)
    dr.rectangle((6, 6, w - 6, 120), fill=accent)
    dr.text((44, 30), header, fill="white", font=font(38, True))
    dr.text((44, 78), sub, fill=(230, 235, 245), font=font(22))
    photo = portrait(seed, (220, 270))
    img.paste(photo, (44, 160))
    dr.rectangle((44, 160, 264, 430), outline=(190, 190, 190), width=2)
    y = 165
    for label, value in fields:
        dr.text((300, y), label.upper(), fill=(120, 120, 120), font=font(18))
        dr.text((300, y + 22), value, fill=(25, 25, 25), font=font(30, True))
        y += 78
    if footer:
        dr.text((44, h - 70), footer, fill=(90, 90, 90), font=font(22))
    img = _watermark(img)
    return img


def pdf_pages(title: str, subtitle: str, sections: list, landscape: bool = False, accent=(25, 25, 25),
              pages_text: list = None) -> tuple:
    """A text document rendered to page images -> (pdf_bytes, thumb, plain_text)."""
    W, H = (1600, 900) if landscape else (1240, 1754)
    pages = []
    body = list(sections)
    plain = [title, subtitle]
    while body or not pages:
        img = Image.new("RGB", (W, H), "white")
        dr = ImageDraw.Draw(img)
        dr.rectangle((0, 0, W, 14), fill=accent)
        y = 90
        if not pages:
            dr.text((90, y), title, fill=(20, 20, 20), font=font(58 if landscape else 50, True))
            y += 80
            dr.text((90, y), subtitle, fill=(110, 110, 110), font=font(28))
            y += 90
        while body and y < H - 220:
            heading, lines = body.pop(0)
            plain.append(heading)
            dr.text((90, y), heading, fill=accent, font=font(34 if landscape else 30, True))
            y += 58
            for line in lines:
                plain.append(line)
                dr.text((110, y), line, fill=(45, 45, 45), font=font(30 if landscape else 26))
                y += 46
            y += 30
        dr.text((90, H - 80), f"Page {len(pages) + 1}", fill=(160, 160, 160), font=font(22))
        pages.append(_watermark(img, 34))
    out = io.BytesIO()
    pages[0].save(out, "PDF", save_all=True, append_images=pages[1:], resolution=150)
    return out.getvalue(), _thumb(pages[0]), "\n".join(plain)


def docx(title: str, paragraphs: list) -> bytes:
    """Minimal valid .docx (Office Open XML) built with the stdlib."""
    esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    body = f'<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>{esc(title)}</w:t></w:r></w:p>'
    body += f'<w:p><w:r><w:t>{esc(WATERMARK)}</w:t></w:r></w:p>'
    body += "".join(f'<w:p><w:r><w:t xml:space="preserve">{esc(p)}</w:t></w:r></w:p>' for p in paragraphs)
    files = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        "word/document.xml": f'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}</w:body></w:document>',
    }
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name, content in files.items():
            z.writestr(name, content)
    return out.getvalue()


PNG, JPG, PDF = "image/png", "image/jpeg", "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _doc(file_name, mime, data, thumb, title, category, description, owner=None, tags=(), text="",
         issue=None, expiry=None):
    return {"file_name": file_name, "mime_type": mime, "data": data, "thumbnail": thumb,
            "meta": {"title": title, "category": category, "description": description, "owner": owner,
                     "tags": list(tags), "text": text[:1500], "issue_date": issue, "expiry_date": expiry}}


def _card_doc(file_name, title, category, description, header, sub, fields, owner=None, tags=(),
              seed=0, accent=(30, 80, 140), expiry=None, footer=""):
    img = id_card(header, sub, fields, accent, seed, footer)
    text = f"{header} {sub} " + " ".join(f"{k}: {v}" for k, v in fields)
    return _doc(file_name, PNG, _png(img), _thumb(img), title, category, description, owner, tags, text,
                expiry=expiry)


def _pdf_doc(file_name, title, category, description, ptitle, psub, sections, owner=None, tags=(),
             landscape=False, accent=(25, 25, 25), issue=None, expiry=None):
    data, thumb, text = pdf_pages(ptitle, psub, sections, landscape, accent)
    return _doc(file_name, PDF, data, thumb, title, category, description, owner, tags, text, issue, expiry)


# ------------------------------------------------------------------ personal
def personal_documents(name: str = "Sanket Shah") -> list:
    p_exp, dl_exp = d(150), d(4 * 365)
    docs = [
        _card_doc("aadhaar_front.png", "Aadhaar card", "Identity", "Your Aadhaar - ID and address proof for KYC.",
                  "Aadhaar (sample)", "Unique Identification · specimen layout", [
                      ("Name", name), ("Date of birth", "12/03/1994"), ("Gender", "Male"), ("Aadhaar no.", "XXXX XXXX 4821")],
                  owner="Me", tags=["aadhaar", "aadhar", "uid", "id proof", "address proof", "kyc"], seed=0,
                  footer="Address: 14 Sample Lane, Andheri West, Mumbai 400053"),
        _card_doc("pan_card.png", "PAN card", "Identity", "Permanent Account Number card - needed for tax and banking.",
                  "PAN (sample)", "Income Tax Department · specimen layout", [
                      ("Name", name.upper()), ("Father's name", "RAJESH SHAH"), ("Date of birth", "12/03/1994"), ("PAN", "XXXXX4821X")],
                  owner="Me", tags=["pan", "pan card", "tax id", "id proof", "kyc"], seed=0, accent=(20, 100, 160)),
        _pdf_doc("passport_bio_page.pdf", "Passport", "Identity", "Passport bio-data page - expires in about 5 months.",
                 "Passport · bio-data page (sample)", "Republic of Sampleland · specimen", [
                     ("Holder", [f"Name: {name}", "Nationality: Indian", "Date of birth: 12 Mar 1994", "Place of birth: Pune"]),
                     ("Document", ["Passport no.: XXXXX912", f"Date of issue: {pretty(d(-3500))}", f"Date of expiry: {pretty(p_exp)}",
                                   "Place of issue: Mumbai"]),
                 ], owner="Me", tags=["passport", "travel document", "id proof", "visa"], accent=(20, 50, 100),
                 issue=d(-3500), expiry=p_exp),
        _doc("passport_photo.jpg", JPG, _jpg(portrait(0)), _thumb(portrait(0)), "Passport-size photo", "Photos",
             "Recent passport-size photograph on a plain background.", "Me",
             ["photo", "passport photo", "passport size photo", "picture", "headshot"], "Passport size photograph"),
        _card_doc("driving_licence.png", "Driving licence", "Identity", "Driving licence for cars and two-wheelers.",
                  "Driving Licence (sample)", "Transport Department · specimen layout", [
                      ("Name", name), ("Licence no.", "MH02 XXXX 77812"), ("Valid till", pretty(dl_exp)), ("Class", "LMV, MCWG")],
                  owner="Me", tags=["driving licence", "driving license", "dl", "id proof"], seed=0, accent=(110, 60, 20),
                  expiry=dl_exp),
        _pdf_doc("hdfc_statement_q3.pdf", "HDFC bank statement · Jul–Sep 2026", "Finance",
                 "Three months of savings-account statements - useful for visas and loans.",
                 "Account statement (sample)", "Savings account XXXX6612 · 01 Jul – 30 Sep 2026", [
                     ("Summary", ["Opening balance: ₹2,41,880", "Total credits: ₹5,52,000", "Total debits: ₹3,08,410",
                                  "Closing balance: ₹4,85,470"]),
                     ("July", ["01 Jul  Salary credit - Sample Tech Pvt Ltd   + ₹1,84,000", "05 Jul  Rent - Mr Fernandes   - ₹42,000",
                               "18 Jul  Credit card bill   - ₹38,220"]),
                     ("August", ["01 Aug  Salary credit   + ₹1,84,000", "05 Aug  Rent   - ₹42,000", "22 Aug  SIP - Index fund   - ₹25,000"]),
                     ("September", ["01 Sep  Salary credit   + ₹1,84,000", "05 Sep  Rent   - ₹42,000", "14 Sep  Flight booking   - ₹18,640"]),
                 ], owner="Me", tags=["bank statement", "statement", "hdfc", "proof of funds", "visa"], accent=(0, 70, 140)),
        _pdf_doc("salary_slip_sep.pdf", "Salary slip · Sep 2026", "Finance", "September 2026 payslip.",
                 "Payslip · September 2026 (sample)", "Sample Tech Pvt Ltd", [
                     ("Employee", [f"Name: {name}", "Employee ID: ST-0412", "Designation: Product Manager"]),
                     ("Earnings", ["Basic: ₹92,000", "HRA: ₹46,000", "Special allowance: ₹62,000", "Gross: ₹2,00,000"]),
                     ("Deductions", ["Provident fund: ₹11,040", "Professional tax: ₹200", "TDS: ₹4,760", "Net pay: ₹1,84,000"]),
                 ], owner="Me", tags=["salary slip", "payslip", "pay slip", "income proof"], accent=(60, 60, 140)),
        _pdf_doc("salary_slip_aug.pdf", "Salary slip · Aug 2026", "Finance", "August 2026 payslip.",
                 "Payslip · August 2026 (sample)", "Sample Tech Pvt Ltd", [
                     ("Employee", [f"Name: {name}", "Employee ID: ST-0412"]),
                     ("Summary", ["Gross: ₹2,00,000", "Deductions: ₹16,000", "Net pay: ₹1,84,000"]),
                 ], owner="Me", tags=["salary slip", "payslip", "income proof"], accent=(60, 60, 140)),
        _pdf_doc("itr_ack_fy2526.pdf", "Income tax return · FY 2025-26", "Tax", "ITR-V acknowledgement for FY 2025-26.",
                 "ITR-V acknowledgement (sample)", "Assessment year 2026-27", [
                     ("Taxpayer", [f"Name: {name}", "PAN: XXXXX4821X", "Form: ITR-1"]),
                     ("Summary", ["Gross total income: ₹24,10,000", "Tax paid: ₹3,92,400", f"Filed on: {pretty(d(-95))}"]),
                 ], owner="Me", tags=["itr", "income tax return", "tax", "itr-v", "visa"], accent=(30, 90, 60), issue=d(-95)),
        _pdf_doc("rent_agreement.pdf", "Rent agreement · Andheri flat", "Home",
                 "Leave-and-licence agreement for the Andheri flat with Mr. Fernandes.",
                 "Leave and Licence Agreement (sample)", "14 Sample Lane, Andheri West", [
                     ("Parties", ["Licensor: Mr. A. Fernandes", f"Licensee: {name}"]),
                     ("Terms", ["Monthly rent: ₹42,000", "Deposit: ₹2,00,000", f"Period: {pretty(d(-300))} to {pretty(d(65))}"]),
                 ], owner="Me", tags=["rent agreement", "lease", "address proof", "rental"], accent=(120, 70, 30),
                 issue=d(-300), expiry=d(65)),
        _pdf_doc("electricity_bill_oct.pdf", "Electricity bill · Oct 2026", "Home", "Adani Electricity bill - also works as address proof.",
                 "Electricity bill (sample)", "Consumer no. XXXX0931", [
                     ("Bill", ["Units: 312", "Amount due: ₹3,480", f"Due date: {pretty(d(6))}"]),
                 ], owner="Me", tags=["electricity bill", "utility bill", "address proof"], accent=(200, 120, 0), expiry=d(6)),
        _pdf_doc("health_insurance.pdf", "Health insurance policy", "Insurance", "Family floater health policy, ₹10L cover.",
                 "Health insurance policy (sample)", "Policy no. XXXX-HI-2231", [
                     ("Cover", ["Sum insured: ₹10,00,000", "Members: Self, Mum, Dad", f"Valid till: {pretty(d(210))}"]),
                 ], owner="Me", tags=["health insurance", "mediclaim", "insurance policy"], accent=(0, 120, 110), expiry=d(210)),
        _pdf_doc("car_insurance.pdf", "Car insurance · MH02 XX 4421", "Vehicle", "Comprehensive car insurance - renew soon.",
                 "Motor insurance policy (sample)", "Hatchback · MH02 XX 4421", [
                     ("Policy", ["Insured declared value: ₹5,20,000", f"Valid till: {pretty(d(20))}"]),
                 ], owner="Me", tags=["car insurance", "motor insurance", "vehicle"], accent=(140, 30, 30), expiry=d(20)),
        _pdf_doc("vitamin_d_report.pdf", "Blood test report · Vitamin D", "Medical", "Lab report showing low Vitamin D.",
                 "Laboratory report (sample)", "Sunrise Diagnostics", [
                     ("Results", ["25-OH Vitamin D: 14.2 ng/mL (low)", "Haemoglobin: 14.1 g/dL", "TSH: 2.1 mIU/L"]),
                     ("Doctor", ["Dr. Kavita Mehta - start Vitamin D supplements, recheck in 3 months"]),
                 ], owner="Me", tags=["blood test", "lab report", "vitamin d", "medical report"], accent=(160, 30, 80),
                 issue=d(-9)),
        _pdf_doc("degree_certificate.pdf", "B.Tech degree certificate", "Education", "Bachelor of Technology degree certificate.",
                 "Degree certificate (sample)", "University of Sampleland", [
                     ("Award", [f"This is to certify that {name}", "has been awarded Bachelor of Technology", "in Computer Engineering, 2016"]),
                 ], owner="Me", tags=["degree", "certificate", "education", "graduation"], accent=(90, 40, 120)),
        _pdf_doc("goa_flight.pdf", "Flight ticket · Mumbai → Goa", "Travel", "Return flight for Rohan's wedding in February.",
                 "E-ticket (sample)", "PNR XXX4K2", [
                     ("Onward", [f"{pretty(d(110))}  BOM 07:10 → GOI 08:20"]),
                     ("Return", [f"{pretty(d(116))}  GOI 19:45 → BOM 21:00"]),
                     ("Passenger", [name]),
                 ], owner="Me", tags=["flight ticket", "e-ticket", "boarding", "travel", "goa"], accent=(0, 90, 160), expiry=d(110)),
        _card_doc("mum_aadhaar.png", "Aadhaar card · Mum", "Identity", "Mum's Aadhaar card.",
                  "Aadhaar (sample)", "Unique Identification · specimen layout", [
                      ("Name", "Sunita Shah"), ("Date of birth", "05/08/1966"), ("Gender", "Female"), ("Aadhaar no.", "XXXX XXXX 1190")],
                  owner="Mum", tags=["aadhaar", "aadhar", "uid", "id proof", "mum", "mother"], seed=2),
        _pdf_doc("dad_passport.pdf", "Passport · Dad", "Identity", "Dad's passport bio-data page.",
                 "Passport · bio-data page (sample)", "Republic of Sampleland · specimen", [
                     ("Holder", ["Name: Rajesh Shah", "Date of birth: 21 Jan 1962"]),
                     ("Document", ["Passport no.: XXXXX330", f"Date of expiry: {pretty(d(900))}"]),
                 ], owner="Dad", tags=["passport", "dad", "father", "travel document"], accent=(20, 50, 100), expiry=d(900)),
    ]
    return docs


# ------------------------------------------------------------------ work
def work_documents() -> list:
    return [
        _pdf_doc("Acme_MSA_signed.pdf", "Acme Logistics MSA", "Contracts", "Master services agreement with Acme Logistics.",
                 "Master Services Agreement (sample)", "Between Sample Consulting LLP and Acme Logistics Pvt Ltd", [
                     ("Term", [f"Effective: {pretty(d(-330))}", f"Ends: {pretty(d(35))} (auto-renews unless notice)"]),
                     ("Commercials", ["Monthly retainer: ₹6,00,000", "Payment terms: Net 30", "SLA target: 98% on-time delivery"]),
                     ("Signatories", ["Neha Kulkarni, VP Operations - Acme Logistics", "For Sample Consulting LLP"]),
                 ], owner="Acme Logistics", tags=["msa", "contract", "agreement", "acme", "master services agreement"],
                 accent=(30, 60, 110), issue=d(-330), expiry=d(35)),
        _pdf_doc("Acme_SOW_3.pdf", "Acme SOW #3 · Routing optimisation", "Contracts", "Statement of work for the routing-model project.",
                 "Statement of Work #3 (sample)", "Acme Logistics · Routing optimisation", [
                     ("Scope", ["Route-planning model for Mumbai & Pune hubs", "Weekly written updates to Neha", "Benchmarks for Ritu (CTO)"]),
                     ("Fees", ["Fixed fee: ₹18,00,000", "Milestones: 30 / 40 / 30"]),
                 ], owner="Acme Logistics", tags=["sow", "statement of work", "acme", "contract"], accent=(30, 60, 110)),
        _pdf_doc("Acme_QBR_Q3_deck.pdf", "Acme QBR deck · Q3", "Proposals & Decks", "Quarterly business review slides for Acme.",
                 "Acme Logistics · Q3 Business Review (sample)", "Prepared by Sample Consulting", [
                     ("Highlights", ["On-time delivery 96% (target 98%)", "Cost per drop down 11%", "2 new hubs onboarded"]),
                     ("Next quarter", ["Routing model v2 pilot", "Renewal: 2-year option at current price"]),
                 ], owner="Acme Logistics", tags=["qbr", "deck", "presentation", "slides", "acme", "quarterly review"],
                 landscape=True, accent=(200, 120, 20)),
        _pdf_doc("Brightline_NDA.pdf", "NDA · Brightline", "Contracts", "Mutual non-disclosure agreement with Brightline.",
                 "Mutual Non-Disclosure Agreement (sample)", "Sample Consulting LLP · Brightline Inc.", [
                     ("Term", [f"Signed: {pretty(d(-20))}", "Duration: 2 years"]),
                 ], owner="Brightline", tags=["nda", "non-disclosure", "confidentiality", "brightline"], accent=(80, 80, 80),
                 issue=d(-20)),
        _doc("Brightline_pilot_proposal.docx", DOCX, docx("Brightline pilot proposal (draft)", [
            "Prepared for Daniel Park, Head of Growth, Brightline.",
            "Objective: reduce churn in the 40-person growth team's accounts by 15% in 90 days.",
            "Approach: churn-risk scoring, weekly playbooks, exec dashboard.",
            "Commercials: ₹9,00,000 fixed for the 90-day pilot.",
        ]), None, "Brightline pilot proposal", "Proposals & Decks", "Draft 90-day churn pilot proposal for Brightline.",
             "Brightline", ["proposal", "pilot", "brightline", "churn"], "Brightline pilot proposal: churn reduction 90 days ₹9,00,000"),
        _pdf_doc("INV-2026-031_Acme.pdf", "Invoice INV-2026-031 · Acme", "Invoices", "October retainer invoice to Acme Logistics.",
                 "Tax invoice INV-2026-031 (sample)", "Sample Consulting LLP → Acme Logistics", [
                     ("Line items", ["October retainer: ₹6,00,000", "GST 18%: ₹1,08,000", "Total: ₹7,08,000"]),
                     ("Payment", [f"Due: {pretty(d(12))}"]),
                 ], owner="Acme Logistics", tags=["invoice", "acme", "bill", "receivable"], accent=(30, 90, 60), expiry=d(12)),
        _pdf_doc("SD_Studio_invoice_0142.pdf", "Invoice #0142 · Sam D'Souza", "Invoices", "Brand design invoice from Sam.",
                 "Invoice #0142 (sample)", "SD Studio → Sample Consulting LLP", [
                     ("Items", ["Brand system - ink + amber: ₹1,20,000", "Total: ₹1,20,000"]),
                     ("Payment", [f"Due: {pretty(d(5))}"]),
                 ], owner="Sam D'Souza", tags=["invoice", "payable", "design", "sam"], accent=(20, 20, 20), expiry=d(5)),
        _pdf_doc("Ananya_Rao_resume.pdf", "Resume · Ananya Rao", "HR & Hiring", "Senior backend engineer candidate's CV.",
                 "Ananya Rao (sample CV)", "Senior Backend Engineer", [
                     ("Experience", ["Backend Engineer, Fintech Co (4 yrs) - payments, Postgres, Kafka", "SDE, Retail Co (2 yrs)"]),
                     ("Skills", ["Postgres, Python, Go, queues, distributed systems"]),
                 ], owner="Ananya Rao", tags=["resume", "cv", "candidate", "backend", "hiring"], accent=(90, 40, 120)),
        _doc("Offer_letter_template.docx", DOCX, docx("Offer letter - template", [
            "Dear [Candidate], we're delighted to offer you the role of [Title] at Sample Consulting LLP.",
            "Compensation: [CTC] per annum. Joining date: [Date].",
        ]), None, "Offer letter template", "HR & Hiring", "Standard offer letter template.", None,
             ["offer letter", "template", "hiring", "hr"], "Offer letter template"),
        _pdf_doc("GST_certificate.pdf", "GST registration certificate", "Company & Legal", "GSTIN registration for the LLP.",
                 "GST registration certificate (sample)", "Form GST REG-06", [
                     ("Details", ["Legal name: Sample Consulting LLP", "GSTIN: 27XXXXX4821X1Z5", "State: Maharashtra"]),
                 ], owner="Sample Consulting LLP", tags=["gst", "gstin", "registration", "company", "tax"], accent=(30, 90, 60)),
        _pdf_doc("LLP_incorporation.pdf", "LLP incorporation certificate", "Company & Legal", "Certificate of incorporation.",
                 "Certificate of Incorporation (sample)", "Registrar of Companies", [
                     ("Entity", ["Sample Consulting LLP", "LLPIN: XXX-4821", f"Incorporated: {pretty(d(-1400))}"]),
                 ], owner="Sample Consulting LLP", tags=["incorporation", "company", "llp", "legal", "coi"], accent=(60, 60, 60)),
        _pdf_doc("Pitch_deck_2026.pdf", "Pitch deck · 2026", "Proposals & Decks", "Company pitch deck for investors.",
                 "Sample Consulting · Pitch 2026 (sample)", "Routing intelligence for logistics", [
                     ("Traction", ["22 paying customers", "₹4.1 Cr ARR", "Net revenue retention 128%"]),
                     ("Ask", ["Seed extension: ₹6 Cr"]),
                 ], owner=None, tags=["pitch deck", "deck", "investor", "fundraising", "slides"], landscape=True,
                 accent=(30, 30, 30)),
        _doc("omar_business_card.jpg", JPG, *(lambda img: (_jpg(img), _thumb(img)))(
            id_card("Tidewater AI", "Omar Haddad · Founder", [("Email", "omar@tidewater.ai"), ("Phone", "+971 50 XXX 2210")],
                    accent=(10, 90, 110), seed=3)),
             "Business card · Omar Haddad", "Other", "Omar's card from SaaSBoomi.", "Omar Haddad",
             ["business card", "visiting card", "omar", "tidewater"], "Omar Haddad Founder Tidewater AI"),
    ]


def both_documents() -> list:
    personal = {doc["file_name"]: doc for doc in personal_documents("Sanket Shah")}
    work = {doc["file_name"]: doc for doc in work_documents()}
    pick_p = ["aadhaar_front.png", "pan_card.png", "passport_bio_page.pdf", "passport_photo.jpg", "hdfc_statement_q3.pdf",
              "salary_slip_sep.pdf", "itr_ack_fy2526.pdf", "car_insurance.pdf", "rent_agreement.pdf", "vitamin_d_report.pdf"]
    pick_w = ["Acme_MSA_signed.pdf", "Acme_QBR_Q3_deck.pdf", "Brightline_NDA.pdf", "INV-2026-031_Acme.pdf",
              "Pitch_deck_2026.pdf", "Brightline_pilot_proposal.docx"]
    return [personal[n] for n in pick_p] + [work[n] for n in pick_w]


SETS = {"personal": personal_documents, "work": work_documents, "both": both_documents}

if __name__ == "__main__":
    persona = sys.argv[1] if len(sys.argv) > 1 else "personal"
    out_dir = os.path.expanduser(sys.argv[2] if len(sys.argv) > 2 else f"./sample-docs-{persona}")
    os.makedirs(out_dir, exist_ok=True)
    for doc in SETS[persona]():
        with open(os.path.join(out_dir, doc["file_name"]), "wb") as f:
            f.write(doc["data"])
    print(f"Wrote {len(SETS[persona]())} files to {out_dir}")
