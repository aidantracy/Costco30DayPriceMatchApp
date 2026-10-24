from app.domain.exclusions import ExclusionRule, MatchType, exclusion_reason

RULES = [
    ExclusionRule(MatchType.ITEM_NUMBER, "1111111", "Precious metals"),
    ExclusionRule(MatchType.DEPARTMENT, "Special Order Kiosk", "Separate promotion rules"),
    ExclusionRule(MatchType.KEYWORD, "gold bar", "Precious metals"),
]


def test_matches_item_number() -> None:
    assert exclusion_reason("1111111", "EXAMPLE", None, RULES) == "Precious metals"


def test_matches_department_ignoring_case() -> None:
    reason = exclusion_reason("2222222", "SOFA", "special order kiosk", RULES)
    assert reason == "Separate promotion rules"


def test_matches_whole_keyword_ignoring_case() -> None:
    assert exclusion_reason("3333333", "1 OZ GOLD BAR", None, RULES) == "Precious metals"


def test_keyword_does_not_match_inside_other_words() -> None:
    assert exclusion_reason("4444444", "GOLD BARLEY TEA", None, RULES) is None


def test_eligible_item_returns_none() -> None:
    assert exclusion_reason("5555555", "TIRES 4 PACK", "Tires", RULES) is None


def test_empty_rule_list_excludes_nothing() -> None:
    assert exclusion_reason("1111111", "ANYTHING", None, []) is None
