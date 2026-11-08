# Arrowsterr database baseline

The full schema of the database on the Hostinger server, built on 2026-11-08 when the database moved off Supabase cloud.
A new database is these files run in order, then any migration added after this date.

| File | Holds |
|---|---|
| 00_extensions_schemas.sql | Extensions and the app's own schemas |
| 01_types.sql | Enum and composite types |
| 02_functions.sql | Functions |
| 03_tables.sql | Tables, each with its sequences, defaults and keys |
| 04_views.sql | Views |
| 05_keys_indexes.sql | Foreign keys and indexes |
| 06_triggers.sql | Triggers |
| 07_security.sql | Row level security, policies and grants |
| 08_realtime.sql | Tables sent over Realtime |

## Removed in the move

Nothing in the code, in another database function, view, policy, trigger or scheduled job used these.

Tables (0): none

Functions (0): none

## Migrations that had never run on the live database

These were in the repo but missing from the live database. They ran on the new one.

- 025_snapshots.sql (the free AI Snapshot table; the live database never had it)

The old Supabase project keeps everything above until it is deleted.
