from pathlib import Path

root = Path(__file__).resolve().parents[1] / "assets" / "products"
root.mkdir(parents=True, exist_ok=True)

items = [
    ("homes", "01", "HOMES", 1120, 460),
    ("lekkeleer", "02", "LEKKELEER", 420, 380),
    ("driving", "03", "DRIVING", 980, 620),
    ("vr-training", "04", "TRAINING", 640, 510),
    ("webar", "05", "WEBAR", 1280, 340),
    ("book-a-barber", "06", "BARBER", 360, 640),
    ("3d-print", "07", "PRINT", 860, 280),
    ("3dgs", "08", "3DGS", 740, 540),
]

for slug, num, label, cx, cy in items:
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000" role="img" aria-label="Placeholder for {label}">
  <rect width="1600" height="1000" fill="#07101c"/>
  <rect x="48" y="48" width="1504" height="904" fill="none" stroke="rgba(248,250,252,0.08)" stroke-width="1"/>
  <line x1="48" y1="{cy}" x2="1552" y2="{cy}" stroke="rgba(248,250,252,0.05)" stroke-width="1"/>
  <line x1="{cx}" y1="48" x2="{cx}" y2="952" stroke="rgba(248,250,252,0.05)" stroke-width="1"/>
  <circle cx="{cx}" cy="{cy}" r="5" fill="#72ed6b"/>
  <text x="80" y="910" fill="rgba(248,250,252,0.32)" font-family="system-ui, sans-serif" font-size="22" letter-spacing="6">{num}  {label}  ·  PLACEHOLDER</text>
</svg>
"""
    (root / f"{slug}.svg").write_text(svg, encoding="utf-8")

print("wrote", len(items), "placeholders to", root)
