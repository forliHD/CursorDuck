-- Ideas are shown in the visitor's language: the other language is filled in
-- by Workers AI once per idea (see functions/_shared/pond.js).
ALTER TABLE ideas ADD COLUMN tr_title TEXT;
ALTER TABLE ideas ADD COLUMN tr_body TEXT;
