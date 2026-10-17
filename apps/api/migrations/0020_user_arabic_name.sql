-- A person's name in Arabic, when they have one (ALY-99). The ALYR Agent greets an owner
-- by name; in Arabic, "مساء الخير يا هدى" reads right and "يا Huda" does not. Empty means
-- the Arabic screen leaves the name out. People are global (D-022), so no tenant column.

alter table users add column name_ar text not null default '';
