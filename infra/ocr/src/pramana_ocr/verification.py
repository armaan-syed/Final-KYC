"""Pure verification logic; the field contract is supplied by the caller."""

from __future__ import annotations

from collections.abc import Iterable, Mapping

from .normalization import normalize_value


def compare_fields(
    customer: Mapping[str, str | None],
    extracted: Mapping[str, str | None],
    fields: Iterable[str],
) -> dict[str, object]:
    """Compare required fields while distinguishing missing OCR from mismatch.

    ``is_match`` remains for compatibility with the existing PostgreSQL schema;
    the explicit status is the reviewer-facing meaning of each comparison.
    """
    comparisons: list[dict[str, object]] = []
    for field_name in fields:
        customer_value = normalize_value(field_name, customer.get(field_name))
        document_value = normalize_value(field_name, extracted.get(field_name))
        if document_value is None:
            comparison_status = "NOT_EXTRACTED"
        elif customer_value is None:
            # Required customer profile fields are normally non-null. If an
            # incomplete profile reaches here, it still requires human review.
            comparison_status = "NOT_EXTRACTED"
        elif customer_value == document_value:
            comparison_status = "MATCH"
        else:
            comparison_status = "MISMATCH"
        comparisons.append(
            {
                "field_name": field_name,
                "customer_value": customer_value,
                "document_value": document_value,
                "is_match": comparison_status == "MATCH",
                "status": comparison_status,
            }
        )

    if not comparisons:
        raise ValueError("at least one comparison field must be configured")

    matched = sum(result["status"] == "MATCH" for result in comparisons)
    percentage = round(matched * 100 / len(comparisons), 2)
    missing_fields = [
        str(result["field_name"])
        for result in comparisons
        if result["status"] == "NOT_EXTRACTED"
    ]
    return {
        "field_comparisons": comparisons,
        "overall_status": "AUTO_VERIFIED" if matched == len(comparisons) else "REVIEW_REQUIRED",
        "match_percentage": percentage,
        "review_reason": (
            "Required document fields could not be extracted: " + ", ".join(missing_fields)
            if missing_fields
            else None
        ),
    }
