from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from pramana_ocr.normalization import normalize_date, normalize_gender, normalize_name
from pramana_ocr.parser import parse_aadhaar, parse_document, parse_pan
from pramana_ocr.pipeline import extract_document_fields
from pramana_ocr.imaging import render_pages
from pramana_ocr.verification import compare_fields


class ParserTests(unittest.TestCase):
    def test_parse_synthetic_aadhaar_text(self):
        result = parse_aadhaar(
            """Government of India
ARJUN DEMO
DOB: 02/01/2000
Male
1234 5678 9012
Address: 1 Example Road, Test City"""
        )
        self.assertEqual(result["name"], "ARJUN DEMO")
        self.assertEqual(result["date_of_birth"], "02/01/2000")
        self.assertEqual(result["gender"], "Male")
        self.assertEqual(result["aadhaar_number"], "123456789012")
        self.assertEqual(result["address"], "1 Example Road, Test City")

    def test_parse_synthetic_pan_text(self):
        result = parse_pan(
            """INCOME TAX DEPARTMENT
Name: ARJUN DEMO
Father's Name: RAVI DEMO
02/01/2000
ABCDE1234F"""
        )
        self.assertEqual(result["name"], "ARJUN DEMO")
        self.assertEqual(result["father_name"], "RAVI DEMO")
        self.assertEqual(result["date_of_birth"], "02/01/2000")
        self.assertEqual(result["pan_number"], "ABCDE1234F")

    def test_missing_fields_are_omitted(self):
        self.assertEqual(parse_aadhaar("Government of India"), {})

    def test_unknown_document_type_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "AADHAAR or PAN"):
            parse_document("VOTER_ID", "some text")


class NormalizationTests(unittest.TestCase):
    def test_normalize_name_and_date(self):
        self.assertEqual(normalize_name("  Arjun-Demo,  "), "ARJUN DEMO")
        self.assertEqual(normalize_date("02/01/2000"), "2000-01-02")
        self.assertEqual(normalize_date("2000-01-02"), "2000-01-02")
        self.assertIsNone(normalize_date("31/02/2000"))

    def test_normalize_gender_aliases(self):
        self.assertEqual(normalize_gender("M"), "male")
        self.assertEqual(normalize_gender(" FEMALE "), "female")
        self.assertIsNone(normalize_gender("unknown"))


class VerificationTests(unittest.TestCase):
    def test_exact_match_uses_only_explicit_fields(self):
        result = compare_fields(
            {"name": "Arjun Demo", "date_of_birth": "2000-01-02", "phone": "ignored"},
            {"name": "ARJUN-DEMO", "date_of_birth": "02/01/2000"},
            ["name", "date_of_birth"],
        )
        self.assertEqual(result["overall_status"], "AUTO_VERIFIED")
        self.assertEqual(result["match_percentage"], 100.0)
        self.assertEqual(len(result["field_comparisons"]), 2)

    def test_missing_values_fail_closed(self):
        result = compare_fields({"name": "ARJUN DEMO"}, {}, ["name", "gender"])
        self.assertEqual(result["overall_status"], "REVIEW_REQUIRED")
        self.assertEqual(result["match_percentage"], 0.0)

    def test_empty_field_contract_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "at least one"):
            compare_fields({}, {}, [])


class PipelineTests(unittest.TestCase):
    def test_pipeline_preserves_raw_and_normalized_values(self):
        result = extract_document_fields(
            b"synthetic document bytes",
            "image/png",
            "PAN",
            recognize_text=lambda *_: (
                "Name: Arjun-Demo\nFather's Name: Ravi Demo\n"
                "DOB: 02/01/2000\nABCDE1234F"
            ),
        )
        self.assertEqual(result["name"]["raw_value"], "Arjun-Demo")
        self.assertEqual(result["name"]["normalized_value"], "ARJUN DEMO")
        self.assertEqual(result["date_of_birth"]["raw_value"], "02/01/2000")
        self.assertEqual(result["date_of_birth"]["normalized_value"], "2000-01-02")
        self.assertEqual(result["pan_number"]["normalized_value"], "ABCDE1234F")
        self.assertIsNone(result["name"]["confidence"])

    def test_pipeline_maps_tesseract_confidence_to_extracted_fields(self):
        result = extract_document_fields(
            b"synthetic document bytes",
            "image/png",
            "PAN",
            recognize_text_with_confidence=lambda *_: (
                "Name: Arjun-Demo\nDOB: 02/01/2000\nABCDE1234F",
                [
                    ("Name:", 99.0),
                    ("Arjun-Demo", 92.0),
                    ("DOB:", 99.0),
                    ("02/01/2000", 84.0),
                    ("ABCDE1234F", 96.0),
                ],
            ),
        )
        self.assertEqual(result["name"]["confidence"], 92.0)
        self.assertEqual(result["date_of_birth"]["confidence"], 84.0)
        self.assertEqual(result["pan_number"]["confidence"], 96.0)

    def test_pipeline_rejects_unsupported_type_before_ocr(self):
        def should_not_run(*_):
            raise AssertionError("recognizer ran before type validation")

        with self.assertRaisesRegex(ValueError, "AADHAAR or PAN"):
            extract_document_fields(b"fixture", "image/png", "PASSPORT", recognize_text=should_not_run)

    def test_pipeline_rejects_empty_document(self):
        with self.assertRaisesRegex(ValueError, "document_bytes"):
            extract_document_fields(b"", "image/png", "PAN", recognize_text=lambda *_: "")


class DocumentLimitTests(unittest.TestCase):
    def test_pdf_over_three_pages_is_rejected_before_rendering(self):
        from pramana_limits import MAX_PDF_PAGES

        class FakePDF:
            def __len__(self):
                return MAX_PDF_PAGES + 1

            def close(self):
                self.closed = True

        pdf = FakePDF()
        with patch("pramana_ocr.imaging._imports", return_value=(None, None, None)), patch.dict(
            "sys.modules", {"pypdfium2": SimpleNamespace(PdfDocument=lambda _data: pdf)}
        ):
            with self.assertRaisesRegex(ValueError, "no more than 3 pages"):
                list(render_pages(b"synthetic pdf", "application/pdf"))
        self.assertTrue(pdf.closed)


if __name__ == "__main__":
    unittest.main()
