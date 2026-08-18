from pathlib import Path
from PIL import Image

src = Path(__file__).resolve().parents[1] / "assets" / "products" / "webar-demos"
jobs = [
    ("ARMarker_ResturantMenu.jpg", "restaurant-menu.jpg"),
    ("AR_Floorplan.png", "floorplan.jpg"),
    ("AR_AnimalTattoos.jpg", "animal-tattoos.jpg"),
    ("AR_InRetail.jpg", "in-retail.jpg"),
    ("Marker.png", "vehicle.jpg"),
    ("SI_BusinessCard_Generic.png", "business-card.jpg"),
]
for src_name, dest_name in jobs:
    im = Image.open(src / src_name)
    if im.mode != "RGB":
        im = im.convert("RGB")
    w, h = im.size
    longest = max(w, h)
    if longest > 1600:
        scale = 1600 / longest
        im = im.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    dest = src / dest_name
    im.save(dest, "JPEG", quality=82, optimize=True)
    print(f"{dest_name}: {dest.stat().st_size} bytes {im.size}")

pdf = src / "ReadMe.pdf"
if pdf.exists():
    pdf.unlink()
    print("removed ReadMe.pdf")
