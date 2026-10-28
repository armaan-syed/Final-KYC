"""Pure verification logic; the field contract is supplied by the caller."""

from __future__ import annotations

from collections.abc import Iterable, Mapping

from .normalization import normalize_value


def compare_fields(
    customer: Mapping[str, str | None],
    extracted: Mapping[str, str | None],
    fields: Iterable[str],
) -> dict[str, object]:
    """Compare only explicitly agreed fields; missing values count as mismatches.

    This function does not choose which fields are required, persist the score,
    or write a decision. Those depend on Person B's schema and shared contract.
    """
    comparisons: list[dict[str, object]] = []
    for field_name in fields:
        customer_value = normalize_value(field_name, customer.get(field_name))
        document_value = normalize_value(field_name, extracted.get(field_name))
        matches = customer_value is not None and customer_value == document_value
        comparisons.append(
            {
                "field_name": field_name,
                "customer_value": customer_value,
                "document_value": document_value,
                "is_match": matches,
            }
        )

    if not comparisons:
        raise ValueError("at least one comparison field must be configured")

    matched = sum(bool(result["is_match"]) for result in comparisons)
    percentage = round(matched * 100 / len(comparisons), 2)
    return {
        "field_comparisons": comparisons,
        "overall_status": "AUTO_VERIFIED" if matched == len(comparisons) else "REVIEW_REQUIRED",
        "match_percentage": percentage,
    }
