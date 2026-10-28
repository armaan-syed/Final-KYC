"""Create synthetic, non-personal OCR fixtures for the Lambda runtime POC."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


FIXTURES = {
    "synthetic-aadhaar.png": (
        "GOVERNMENT OF INDIA\n"
        "ARJUN DEMO\n"
        "DOB: 02/01/2000\n"
        "MALE\n"
        "1234 5678 9012\n"
        "Address: 1 Example Road, Test City"
    ),
    "synthetic-pan.png": (
        "INCOME TAX DEPARTMENT\n"
        "Name: ARJUN DEMO\n"
        "Father's Name: RAVI DEMO\n"
        "02/01/2000\n"
        "ABCDE1234F"
    ),
}


def create_fixtures(output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    created: list[Path] = []
    font = ImageFont.load_default(size=28)
    for filename, text in FIXTURES.items():
        image = Image.new("RGB", (1400, 500), color="white")
        draw = ImageDraw.Draw(image)
        draw.multiline_text((48, 48), text, fill="black", font=font, spacing=28)
        destination = output_dir / filename
        image.save(destination, format="PNG", optimize=True)
        created.append(destination)
        if filename == "synthetic-aadhaar.png":
            pdf_destination = output_dir / "synthetic-aadhaar.pdf"
            image.save(pdf_destination, format="PDF", resolution=150.0)
            created.append(pdf_destination)
    return created


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    created = create_fixtures(args.output_dir)
    print(f"Created {len(created)} synthetic OCR fixtures in {args.output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
