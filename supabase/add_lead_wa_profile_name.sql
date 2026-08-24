-- The customer's own WhatsApp profile display name, as the messaging platform
-- reports it (Rafeeq Social's `first_name` on the subscriber record).
--
-- This is NOT the same thing as the lead's name. `data->>'الاسم'` is what the
-- customer typed into an ad form; this is what they set as their own WhatsApp
-- display name. Measured across 35 real أوتو باور leads on 2026-08-24, the two
-- differ 69% of the time — real examples: "محمد الجدعاني" vs "ggaa55556",
-- "صدام العوض" vs "الحمدلله", "Saud alahmed" vs ".". A rep looking for the
-- customer's thread on the Rafeeq Social side needs the latter to find them.
--
-- Deliberately a real column rather than another key inside the `data` JSONB.
-- Both leadName()/leadPhone() (src/lib/utils.ts) and compute_lead_phone_key()
-- match column headers by FUZZY substring, so any plausible key name breaks
-- something — verified against the live helpers on 2026-08-24:
--   * "اسم واتساب"      -> leadName returned the WhatsApp name instead of the
--                          real one, AND compute_lead_phone_key returned
--                          "20177" (digits scraped out of "mprince20177")
--                          instead of the actual phone key.
--   * "wa_profile_name" -> still matched NAME_KEYS via 'name', so leadName
--                          could return it depending on key order.
-- jsonb does not preserve insertion order (keys are sorted by length, then
-- bytes), so "the real name happens to come first" is not a guarantee. A
-- dedicated column is immune to all of it.

alter table leads add column if not exists wa_profile_name text;

comment on column leads.wa_profile_name is
  'Customer''s own WhatsApp profile display name, synced from Rafeeq Social. Distinct from the lead name in data->>''الاسم''.';
