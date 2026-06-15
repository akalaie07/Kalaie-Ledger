-- Migration 0019: Freitext-Closer-Feld
-- Erlaubt die manuelle Eingabe eines Closer-Namens ohne FK-Constraint
-- (z.B. für externe Partner die nicht im System angelegt sind)
alter table deals add column if not exists closer_manual text;
