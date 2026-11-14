-- One-off: removes the fake events that unit tests wrote into the live dashboard before tests/conftest.py stopped it
-- (fake models "m1", "m2", "m3" - they showed up as "nvidia fallback failed x30"). Run in the Supabase SQL editor.
-- Real events never use these model names.
delete from app_event where name = 'nvidia_fallback_failed' and model in ('m1', 'm2', 'm3');
delete from app_event where kind = 'llm' and name = 'extraction' and model = 'm3';
