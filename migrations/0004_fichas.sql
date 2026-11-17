-- Fichas (tokens): cada carta guarda as fichas que cria (JSON com os oracle_id
-- das fichas). As próprias fichas entram em `cards` com layout 'token' e as
-- impressões delas em `prints`. Ver docs/adr/0009-fichas.md.
ALTER TABLE cards ADD COLUMN tokens TEXT;
