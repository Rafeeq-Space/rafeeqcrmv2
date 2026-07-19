-- Rafeeq Social (BotSailor) WhatsApp send API — the write-back credential.
--
-- rafeeq.social is a white-labelled BotSailor. Its WhatsApp API can send a
-- message to a customer:
--   POST https://botsailor.com/api/v1/whatsapp/send
--        apiToken, phone_number_id, message, phone_number
-- so a rep can reply from the CRM and the customer gets it on WhatsApp — the
-- same write-back role bevatel_api_token plays for Bevatel. api_token is the
-- account key; phone_number_id is the WhatsApp account's phone-number id (Meta),
-- shown in BotSailor's user/myInfo response and the Connect Account screen.
--
-- Run this once on Supabase (SQL editor). Idempotent.

alter table tenants add column if not exists rafeeqsocial_api_token text;
alter table tenants add column if not exists rafeeqsocial_phone_number_id text;
