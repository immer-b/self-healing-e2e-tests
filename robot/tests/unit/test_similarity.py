import pytest

from self_healing.similarity import (
    sequence_similarity,
    set_similarity,
    shape_similarity,
    text_shape,
    text_similarity,
    tokenize,
)


class TestTokenize:
    def test_splits_camel_kebab_snake_and_whitespace_into_lowercase_tokens(self):
        assert tokenize("loginButton submit-form user_name  Foo") == ["login", "button", "submit", "form", "user", "name", "foo"]

    def test_drops_punctuation_and_empty_tokens(self):
        assert tokenize("  ⋯ (Save!) ") == ["save"]


class TestTextSimilarity:
    def test_is_1_for_identical_text_ignoring_case_and_whitespace(self):
        assert text_similarity("Log  in", "log in") == 1

    def test_is_0_when_either_side_is_empty(self):
        assert text_similarity("", "abc") == 0

    def test_rewards_containment_and_shared_tokens(self):
        assert text_similarity("Edit", "Edit record") > 0.6
        assert text_similarity("View", "View details") > 0.6

    def test_scores_near_miss_spellings_above_unrelated_words(self):
        assert text_similarity("Log in", "Login") > text_similarity("Log in", "Delete")

    def test_scores_unrelated_text_low(self):
        assert text_similarity("Password", "Search records") < 0.3

    def test_treats_every_word_of_the_shorter_text_in_the_longer_one_as_a_strong_match(self):
        assert text_similarity("Export CSV", "Export report as CSV") > 0.75

    def test_only_counts_containment_on_word_boundaries(self):
        assert text_similarity("active", "inactive") < 0.85
        assert text_similarity("Records", "Total records") > 0.75

    def test_never_scores_different_text_as_an_exact_match(self):
        assert text_similarity("Records", "Records!") <= 0.95


def test_set_similarity_computes_the_jaccard_index():
    assert set_similarity(["a", "b"], ["b", "c"]) == pytest.approx(1 / 3)
    assert set_similarity([], []) == 0


def test_sequence_similarity_compares_ordered_sequences_via_lcs():
    assert sequence_similarity(["form", "main", "body"], ["form", "div", "main", "body"]) == pytest.approx(0.75)
    assert sequence_similarity(["a"], ["b"]) == 0


def test_text_shape_reduces_text_to_its_format():
    assert text_shape("$7,800") == "$9,9"
    assert text_shape("6") == text_shape("12")
    assert text_shape("2 records") == "9 a"


def test_shape_similarity_is_1_for_identical_formats_and_fuzzy_for_longer_texts():
    assert shape_similarity("6", "12") == 1
    assert shape_similarity("6", "2 records") == 0
    assert shape_similarity("Owner bob Status x Amount $800", "Owner: carol Status: y Amount: $3,000") > 0.3
