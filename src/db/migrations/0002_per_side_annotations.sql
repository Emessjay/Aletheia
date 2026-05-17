-- v2: per-side annotations.
--
-- Highlights already had a `translation` column scoped to the column they were
-- made in (NULL = universal). We now treat the four reader columns — Modern
-- English, King James, Hebrew, Greek — as the addressable "sides", and fold
-- en_bsb + en_web (the two physical translations that share the Modern English
-- column via deuterocanon fallback) into a single 'en_modern' side key. Any
-- existing rows that targeted the raw lang strings get rewritten.
--
-- Bookmarks gain a parallel `translation` column so each side can be bookmarked
-- separately on the same verse reference.

ALTER TABLE bookmarks ADD COLUMN translation TEXT;

UPDATE highlights
   SET translation = 'en_modern'
 WHERE translation IN ('en_bsb', 'en_web');
