-- Documents, package 3: the workspace screens (ALY-146, spec 014).
--
-- The Documents list shows the newest first and pages by a cursor (the sort key and the id of
-- the last row seen), so a shop with tens of thousands of documents opens the first page as
-- fast as a shop with ten. The sort key is when the document was issued, or made when it is
-- still a draft; this index is exactly that order, per shop.
--
-- Nothing else changes: the screens read what packages 1 and 2 already keep.

create index documents_newest on documents
    (tenant_id, (coalesce(issued_at, created_at)) desc, id desc);
