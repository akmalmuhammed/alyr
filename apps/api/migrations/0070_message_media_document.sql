-- A document sent on WhatsApp is stored once (ALY-276 PERF-12).
--
-- The outbound layer keeps the file of an outgoing message beside it until the delivering job
-- uploads it to WhatsApp (0021, 0038). For a receipt or an invoice that was a second copy of
-- the PDF already kept in `document_files`, for every send, kept for good. Now the message
-- points at the document whose file it carries, and `data` is left empty. A picture (the
-- weekly report card, an item's photo) is still kept here: it has no other copy.

alter table message_media
    alter column data drop not null,
    add column document_id uuid references documents(id),
    add constraint message_media_one_source check ((data is null) <> (document_id is null));
