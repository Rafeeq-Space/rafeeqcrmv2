-- Take an employee out of automatic lead distribution without suspending them.
--
-- `suspended` was the only existing way to stop leads reaching someone, and it
-- also blocks them from signing in at all — too blunt for a rep who should keep
-- working their current leads while new ones go to the rest of the team.
--
-- Scope is deliberately *automatic* distribution only (round-robin pools).
-- Explicit assignment still works: a manager assigning by hand in the CRM, or a
-- conversation assigned to them on Bevatel/Rafeeq Social, is a decision someone
-- made on purpose and is not overridden.
alter table profiles
  add column if not exists excluded_from_distribution boolean not null default false;
