-- AI Synergy Archive — Supabase schema (Stage 1)
-- Run in Supabase Dashboard → SQL Editor → New query → Run
--
-- Mirrors IndexedDB stores: users, roles, materials, categories, tags,
-- settings, access_requests, action_log
--
-- RLS is enabled with no policies yet → all client access denied until Stage 2.
-- Service role (Dashboard / server) bypasses RLS for admin tasks.

BEGIN;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id                    TEXT PRIMARY KEY,
  login                 TEXT NOT NULL UNIQUE,
  password_hash         TEXT NOT NULL,
  password_salt         TEXT NOT NULL,
  display_name          TEXT NOT NULL DEFAULT '',
  role                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'inactive')),
  password_change_policy TEXT NOT NULL DEFAULT 'never',
  admin_note            TEXT NOT NULL DEFAULT '',
  created_at            BIGINT NOT NULL,
  updated_at            BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users (status);

COMMENT ON TABLE public.users IS 'Archive user accounts (custom auth, not Supabase Auth yet)';

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  permissions  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_roles_name ON public.roles (name);

COMMENT ON TABLE public.roles IS 'Custom permission roles (admin is built-in id on users.role)';

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  parent_id    TEXT REFERENCES public.categories (id) ON DELETE SET NULL,
  guest_access BOOLEAN NOT NULL DEFAULT FALSE,
  created_by   TEXT REFERENCES public.users (id) ON DELETE SET NULL,
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_guest_access ON public.categories (guest_access);

-- ---------------------------------------------------------------------------
-- materials
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.materials (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL DEFAULT '',
  description        TEXT NOT NULL DEFAULT '',
  category_id        TEXT REFERENCES public.categories (id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'published')),
  tags               JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_html       TEXT NOT NULL DEFAULT '',
  media              JSONB NOT NULL DEFAULT '{"images":[],"videos":[],"pdf":null,"links":[]}'::jsonb,
  visibility         JSONB NOT NULL DEFAULT '{"guestAccess":false,"allAuthenticated":false,"specificUsers":[]}'::jsonb,
  author_id          TEXT REFERENCES public.users (id) ON DELETE SET NULL,
  author_name        TEXT NOT NULL DEFAULT '',
  guest_access       BOOLEAN NOT NULL DEFAULT FALSE,
  all_authenticated  BOOLEAN NOT NULL DEFAULT FALSE,
  public_payload     TEXT,
  created_at         BIGINT NOT NULL,
  updated_at         BIGINT NOT NULL,
  published_at       BIGINT,
  deleted_at         BIGINT,
  deleted_by         TEXT REFERENCES public.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_materials_category_id ON public.materials (category_id);
CREATE INDEX IF NOT EXISTS idx_materials_status ON public.materials (status);
CREATE INDEX IF NOT EXISTS idx_materials_deleted_at ON public.materials (deleted_at);
CREATE INDEX IF NOT EXISTS idx_materials_published_at ON public.materials (published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_materials_author_id ON public.materials (author_id);

-- ---------------------------------------------------------------------------
-- tags (taxonomy registry; materials.tags also stores tag names inline)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tags (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tags_name ON public.tags (name);

-- ---------------------------------------------------------------------------
-- settings (key-value store, replaces IndexedDB settings)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
  key   TEXT PRIMARY KEY,
  value JSONB
);

COMMENT ON TABLE public.settings IS 'App settings: initialized, about_text, netlify_site_id, etc.';

-- ---------------------------------------------------------------------------
-- access_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.access_requests (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  telegram     TEXT,
  reason       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  netlify_id   TEXT UNIQUE,
  processed_at BIGINT,
  processed_by TEXT REFERENCES public.users (id) ON DELETE SET NULL,
  created_at   BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_requests_status ON public.access_requests (status);
CREATE INDEX IF NOT EXISTS idx_access_requests_created_at ON public.access_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_requests_email ON public.access_requests (email);

-- ---------------------------------------------------------------------------
-- action_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.action_log (
  id           TEXT PRIMARY KEY,
  action       TEXT NOT NULL,
  target_id    TEXT,
  target_title TEXT,
  details      JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id     TEXT NOT NULL DEFAULT 'system',
  timestamp    BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_action_log_actor_id ON public.action_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_action_log_timestamp ON public.action_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_action_log_action ON public.action_log (action);

-- ---------------------------------------------------------------------------
-- Row Level Security (deny-all until auth layer is migrated in Stage 2+)
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_log ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verify (optional — run separately after COMMIT):
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('users','roles','materials','categories','tags','settings','access_requests','action_log')
--   ORDER BY table_name;
