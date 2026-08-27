"""Unit tests for Luther PG verse-marker matching."""

from __future__ import annotations

import unittest

from extract import RE_VERSE_LENKER, parse_book_section, RE_CHAPTER_ROMAN


class VerseLenkerTests(unittest.TestCase):
    def test_plain_forms(self) -> None:
        cases = [
            ("V. 1. text", "1"),
            ("V. 2a. text", "2"),
            ("V. 1, 2. text", "1"),
            ("V. 1-6. text", "1"),
        ]
        for line, verse in cases:
            with self.subTest(line=line):
                m = RE_VERSE_LENKER.match(line)
                self.assertIsNotNone(m)
                assert m is not None
                self.assertEqual(m.group(1), verse)

    def test_roman_section_prefix(self) -> None:
        cases = [
            ("I. V. 1. _In the beginning God created the heavens and the earth._", "1"),
            ("III. V. 3. _And God said, Let there be light_", "3"),
            ("II. V. 15a. _And I will put enmity_", "15"),
            ("III. V. 21b and 22. _And God saw that it was good._", "21"),
        ]
        for line, verse in cases:
            with self.subTest(line=line):
                m = RE_VERSE_LENKER.match(line)
                self.assertIsNotNone(m)
                assert m is not None
                self.assertEqual(m.group(1), verse)

    def test_parse_gen1_prefixed_anchors(self) -> None:
        body = """\
CHAPTER I.
I. V. 1. _In the beginning God created the heavens and the earth._
Prose on verse 1.
III. V. 3. _And God said, Let there be light: and there was light._
Prose on verse 3.
V. 5. _And God called the light Day._
Plain V. form still works.
"""
        blocks = parse_book_section(
            body,
            verse_re=RE_VERSE_LENKER,
            chapter_re=RE_CHAPTER_ROMAN,
            chapter_arabic=False,
            chapter_offset=0,
        )
        self.assertEqual([(b.chapter, b.verse) for b in blocks], [(1, 1), (1, 3), (1, 5)])
        self.assertTrue(blocks[0].body_lines[0].startswith("I. V. 1."))


if __name__ == "__main__":
    unittest.main()
