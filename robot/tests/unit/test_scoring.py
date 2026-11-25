import re

import pytest

from self_healing.scoring import PickOptions, Ranked, ScoreOptions, pick_best, rank_candidates, score_fingerprint

from .fingerprints import fp

v1_password = fp(
    tag="input", role="textbox", id="password", attributes={"name": "password", "type": "password"},
    accessibleName="Password", context={"label": "Password"}, path=["form", "main", "div", "body"],
)
v2_username = fp(
    tag="input", role="textbox", classes=["input-user"], attributes={"name": "user", "type": "text", "placeholder": "Username"},
    accessibleName="Username", path=["div", "form", "div", "div", "body"],
)
v2_password = fp(
    tag="input", role="textbox", classes=["input-pass"], attributes={"name": "pass", "type": "password", "placeholder": "Password"},
    accessibleName="Password", path=["div", "form", "div", "div", "body"],
)
DYNAMIC = ScoreOptions(dynamic_text=True)


class TestScoreFingerprint:
    def test_scores_an_identical_fingerprint_as_1(self):
        assert score_fingerprint(v1_password, v1_password).score == pytest.approx(1)

    def test_returns_a_per_feature_breakdown(self):
        breakdown = score_fingerprint(v1_password, v2_password).breakdown
        assert (breakdown["tag"], breakdown["type"], breakdown["accessibleName"]) == (1, 1, 1)

    def test_prefers_the_matching_input_type_and_name_when_the_markup_changed(self):
        assert score_fingerprint(v1_password, v2_password).score > score_fingerprint(v1_password, v2_username).score

    def test_gives_partial_credit_for_related_tags_and_roles(self):
        row = fp(tag="tr", role="row", childCount=5)
        list_item = fp(tag="li", role="listitem", childCount=4)
        heading = fp(tag="h1", role="heading")
        assert score_fingerprint(row, list_item).score > score_fingerprint(row, heading).score

    def test_down_weights_own_text_when_dynamic_text_is_set(self):
        baseline = fp(tag="tr", role="row", text="Alpha Project alice active", classes=["row"])
        other = fp(tag="tr", role="row", text="Beta Launch bob inactive", classes=["row"])
        assert score_fingerprint(baseline, other, DYNAMIC).score > score_fingerprint(baseline, other).score

    def test_uses_surrounding_context_such_as_labels(self):
        value = fp(tag="span", text="6", context={"label": "Total records"})
        right = fp(tag="dd", text="6", context={"label": "Records"})
        wrong = fp(tag="dd", text="6", context={"label": "Pending"})
        assert score_fingerprint(value, right).score > score_fingerprint(value, wrong).score

    def test_skips_the_role_feature_when_the_baseline_has_no_role(self):
        assert "role" not in score_fingerprint(fp(tag="span"), fp(tag="dd", role="definition")).breakdown


class TestRankAndPick:
    candidates = [
        {"selector": ".input-user", "fingerprint": v2_username},
        {"selector": ".input-pass", "fingerprint": v2_password},
    ]

    @staticmethod
    def ranked(*scores: tuple[str, float]) -> list[Ranked]:
        return [Ranked(selector, fp(), score, {}) for selector, score in scores]

    def test_orders_candidates_by_descending_score(self):
        ranked = rank_candidates(v1_password, self.candidates)
        assert [c.selector for c in ranked] == [".input-pass", ".input-user"]
        assert ranked[0].score > ranked[1].score

    def test_returns_the_best_candidate_above_the_threshold(self):
        assert pick_best(rank_candidates(v1_password, self.candidates), PickOptions(threshold=0.5)).selector == ".input-pass"

    def test_returns_none_when_nothing_clears_the_threshold(self):
        strict = PickOptions(threshold=0.99, min_score=0.99)
        assert pick_best(rank_candidates(v1_password, self.candidates), strict) is None
        assert pick_best([], PickOptions(threshold=0.1)) is None

    def test_accepts_a_below_threshold_winner_that_clearly_beats_the_runner_up(self):
        options = PickOptions(threshold=0.6, min_score=0.45, min_margin=0.1)
        assert pick_best(self.ranked(("a", 0.55), ("b", 0.3)), options).selector == "a"
        assert pick_best(self.ranked(("a", 0.55), ("b", 0.5)), options) is None
        assert pick_best(self.ranked(("a", 0.4), ("b", 0.1)), options) is None

    def test_ignores_runners_up_from_the_same_group_when_computing_the_margin(self):
        options = PickOptions(0.6, 0.45, 0.1, group_of=lambda s: re.sub(r":nth-of-type\(\d+\)$", "", s))
        rows = self.ranked(("ul > li:nth-of-type(1)", 0.55), ("ul > li:nth-of-type(2)", 0.5), ("h1", 0.2))
        assert pick_best(rows, options).selector == "ul > li:nth-of-type(1)"


class TestDynamicTextAndContext:
    def test_shifts_weight_from_text_to_context_so_labelled_values_still_match(self):
        value = fp(tag="span", classes=["value"], text="6", context={"label": "Total records"})
        right = fp(tag="dd", role="definition", text="6", context={"label": "Records"})
        assert score_fingerprint(value, right, DYNAMIC).score > 0.5

    def test_prefers_a_candidate_whose_value_has_the_same_format(self):
        baseline = fp(tag="span", text="6", context={"label": "Total records"})
        value = fp(tag="dd", text="7", context={"label": "Records"})
        prose = fp(tag="span", text="2 records", context={"label": "alice"})
        assert score_fingerprint(baseline, value, DYNAMIC).score > score_fingerprint(baseline, prose, DYNAMIC).score + 0.1

    def test_lets_a_direct_label_match_dominate_noisy_parent_text(self):
        baseline = fp(tag="span", text="6", context={"label": "Total records", "parentText": "Total records"})
        right = fp(tag="dd", text="6", context={"label": "Records"})
        assert score_fingerprint(baseline, right, DYNAMIC).breakdown["context"] > 0.8

    def test_compares_long_dynamic_text_by_fuzzy_shape(self):
        baseline = fp(tag="div", role="dialog", text="Beta Launch Owner bob Status inactive Amount $800 Close")
        panel = fp(tag="section", role="region", text="Owner: carol Status: active Amount: $3,000 Hide")
        assert score_fingerprint(baseline, panel, DYNAMIC).breakdown["text"] > 0.3


def test_ignore_content_compares_collection_items_by_structure_only():
    row = fp(tag="tr", role="row", text="Beta Launch bob", childCount=5, context={"label": "Epsilon Research dave"})
    card = fp(tag="li", role="listitem", text="Zeta Rollout bob", childCount=4)
    result = score_fingerprint(row, card, ScoreOptions(ignore_content=True))
    assert "text" not in result.breakdown and "context" not in result.breakdown
    assert result.score > 0.45


def test_custom_weights_change_which_features_dominate():
    baseline = fp(tag="button", role="button", text="Save", classes=["btn-save"])
    same_text = fp(tag="a", role="link", text="Save")
    same_class = fp(tag="button", role="button", text="Store", classes=["btn-save"])
    candidates = [{"fingerprint": same_class}, {"fingerprint": same_text}]
    text_only = ScoreOptions(weights={"tag": 0, "role": 0, "type": 0, "attributes": 0, "path": 0, "structure": 0})
    assert rank_candidates(baseline, candidates, text_only)[0].fingerprint is same_text
    assert rank_candidates(baseline, candidates)[0].fingerprint is same_class
