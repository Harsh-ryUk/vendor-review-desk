"""Create explicitly fictional vendor documents for the live demonstration."""
from pathlib import Path
import json
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4

ROOT = Path(__file__).resolve().parent.parent / "public" / "samples"
ROOT.mkdir(parents=True, exist_ok=True)

def gst(prefix):
    alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    factor, total = 2, 0
    for char in prefix[::-1]:
        value = alphabet.index(char) * factor
        total += value // 36 + value % 36
        factor = 1 if factor == 2 else 2
    return prefix + alphabet[(36 - total % 36) % 36]

VENDORS = {
    "northstar": dict(legalName="Northstar Studio Private Limited", email="finance@northstar.example", country="IN", taxId=gst("29AAACN1234A1Z"), account="102030405678", bankCode="HDFC0001234"),
    "willow": dict(legalName="Willow Works Private Limited", email="accounts@willow.example", country="IN", taxId=gst("27AAACW4321B1Z"), account="204060801234", bankCode="ICIC0001234"),
    "cedar": dict(legalName="Cedar Supply Private Limited", email="finance@cedar.example", country="IN", taxId=gst("29AAACC5678C1Z"), account="305070901234", bankCode="HDFC0001234"),
}

def document(filename, title, fields):
    c = canvas.Canvas(str(ROOT / f"{filename}.pdf"), pagesize=A4)
    c.setTitle(f"SAMPLE - {title}")
    width, height = A4
    c.setFillColor(HexColor("#14213a")); c.rect(0, height - 140, width, 140, fill=1, stroke=0)
    c.setFillColor(HexColor("#a9c4ff")); c.setFont("Helvetica", 9)
    c.drawString(45, height - 43, "VENDOR REVIEW DESK  /  FICTIONAL TEST DOCUMENT")
    c.setFillColor(HexColor("#ffffff")); c.setFont("Helvetica-Bold", 22)
    c.drawString(45, height - 85, title)
    c.setFont("Helvetica", 10); c.drawString(45, height - 110, "Created for an operations case study. Not a real certificate or bank document.")
    c.setFillColor(HexColor("#25344b")); c.setFont("Helvetica", 12)
    y = height - 195
    for label, value in fields:
        c.drawString(45, y, f"{label}: {value}"); y -= 40
    c.setStrokeColor(HexColor("#dce3ed")); c.line(45, y - 5, width - 45, y - 5)
    c.setFillColor(HexColor("#68768a")); c.setFont("Helvetica", 10)
    c.drawString(45, y - 38, "All identities, registration identifiers, and banking details are fictional.")
    c.drawString(45, y - 57, "Use only to demonstrate extraction, comparison, and decision rules.")
    c.setFont("Helvetica", 9); c.drawString(45, 45, "SAMPLE ONLY  /  NO EXTERNAL VERIFICATION")
    c.showPage(); c.save()
    mapping = {"Company name":"legalName", "Account holder":"legalName", "GSTIN":"taxId", "Account number":"account", "IFSC":"bankCode", "Valid until":"validUntil"}
    data = {mapping[k]: v for k, v in fields if k in mapping}
    (ROOT / f"{filename}.json").write_text(json.dumps(data, indent=2))
    (ROOT / f"{filename}.txt").write_text("\n".join(f"{k}: {v}" for k, v in fields) + "\n")

for name, vendor in VENDORS.items():
    document(f"{name}-registration", "Company registration details", [("Company name", vendor["legalName"]), ("GSTIN", vendor["taxId"]), ("Country", "India")])
    if name != "willow":
        holder = "Cedar Logistics Private Limited" if name == "cedar" else vendor["legalName"].replace("Private Limited", "Pvt. Ltd.")
        document(f"{name}-bank", "Bank account confirmation", [("Account holder", holder), ("Account number", vendor["account"]), ("IFSC", vendor["bankCode"])])
vendor = VENDORS["northstar"]
document("northstar-changed-bank", "Bank account confirmation", [("Account holder", vendor["legalName"]), ("Account number", "908070605432"), ("IFSC", vendor["bankCode"])])
(ROOT / "submissions.json").write_text(json.dumps(VENDORS, indent=2))
print(f"Created {len(list(ROOT.glob('*.pdf')))} sample PDFs, plus equivalent TXT/JSON fixtures.")
