"""Multi-user study groups: shared, verse-anchored discussion feeds.

A study group is the first surface in Aletheia where users interact with each
other's content rather than their own private highlights/notes. Because every
post is user-generated content visible to the whole group, the access rules and
the moderation lifecycle are non-trivial enough to live in their own module
(``moderation``) as pure, exhaustively-tested logic, separate from the route
layer that persists to Postgres.
"""
