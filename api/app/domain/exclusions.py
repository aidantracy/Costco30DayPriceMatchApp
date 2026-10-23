"""Items Costco won't adjust (BR-6), matched against a configured list (NFR-22)."""

import re
from dataclasses import dataclass
from enum import StrEnum


class MatchType(StrEnum):
    ITEM_NUMBER = "item_number"
    DEPARTMENT = "department"
    KEYWORD = "keyword"


@dataclass(frozen=True, slots=True)
class ExclusionRule:
    match_type: MatchType
    value: str
    reason: str


def exclusion_reason(
    item_number: str, description: str, department: str | None, rules: list[ExclusionRule]
) -> str | None:
    """Return the reason of the first matching rule, or None if the item is eligible."""
    for rule in rules:
        if rule.match_type is MatchType.ITEM_NUMBER and item_number == rule.value:
            return rule.reason
        if (
            rule.match_type is MatchType.DEPARTMENT
            and department is not None
            and department.casefold() == rule.value.casefold()
        ):
            return rule.reason
        if rule.match_type is MatchType.KEYWORD and re.search(
            rf"\b{re.escape(rule.value)}\b", description, flags=re.IGNORECASE
        ):
            return rule.reason
    return None
