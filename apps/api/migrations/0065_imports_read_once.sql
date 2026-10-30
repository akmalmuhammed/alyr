-- ALY-278: an uploaded spreadsheet is read once. Until now the Catalog's import and the sales
-- import read the stored file again for every look at the preview and again to apply it,
-- inside a transaction; a large file takes seconds to read. What was read is kept beside the
-- file (`xlsx.to_stored`: each text once, cells as their place in that list), and the zip of
-- photos keeps its list of files. Both are cleared when the import is applied.
--
-- 0062 to 0064 are taken by open pull requests (#169, #120, #172), so this is 0065.

alter table item_imports
    add column sheet jsonb,
    add column zip_index jsonb;

alter table sale_imports
    add column sheet jsonb;

-- A preview stored before this has no `sheet`: it is answered as gone (not found), and the
-- file is sent again. The Catalog keeps a preview 24 hours.
