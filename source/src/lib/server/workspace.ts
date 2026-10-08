import "server-only";

import { neon } from "@neondatabase/serverless";
import type { TripDraft, UserId } from "@/features/beijing/lib/types";

export type CloudWorkspace = {
  draft: TripDraft;
  revision: number;
  editor: UserId;
  savedTrip: boolean;
  updatedAt: string;
  versionId: number | null;
};

const connectionString = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
export const cloudDatabaseConfigured = () => Boolean(connectionString());

let sqlClient: ReturnType<typeof neon> | null = null;
let schemaReady: Promise<void> | null = null;

const getSql = () => {
  const url = connectionString();
  if (!url) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!sqlClient) sqlClient = neon(url);
  return sqlClient;
};

const ensureSchema = async () => {
  if (schemaReady) return schemaReady;
  const sql = getSql();
  schemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS beijing_play_workspaces (
        space_id TEXT PRIMARY KEY,
        draft JSONB NOT NULL,
        revision BIGINT NOT NULL,
        editor TEXT NOT NULL,
        saved_trip BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS beijing_play_workspace_versions (
        id BIGSERIAL PRIMARY KEY,
        space_id TEXT NOT NULL,
        draft JSONB NOT NULL,
        revision BIGINT NOT NULL,
        editor TEXT NOT NULL,
        saved_trip BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (space_id, revision)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS beijing_play_versions_space_idx ON beijing_play_workspace_versions (space_id, id DESC)`;
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
};

const normalize = (row: Record<string, unknown>): CloudWorkspace => ({
  draft: row.draft as TripDraft,
  revision: Number(row.revision),
  editor: row.editor as UserId,
  savedTrip: Boolean(row.saved_trip),
  updatedAt: new Date(String(row.updated_at)).toISOString(),
  versionId: row.version_id == null ? null : Number(row.version_id),
});

export async function readWorkspace(spaceId: UserId): Promise<CloudWorkspace | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT space_id, draft, revision, editor, saved_trip, updated_at,
      (SELECT id FROM beijing_play_workspace_versions versions WHERE versions.space_id = workspaces.space_id ORDER BY id DESC LIMIT 1) AS version_id
    FROM beijing_play_workspaces workspaces
    WHERE space_id = ${spaceId}
    LIMIT 1
  `;
  const records = rows as Record<string, unknown>[];
  return records[0] ? normalize(records[0]) : null;
}

export async function saveWorkspace(input: { spaceId: UserId; draft: TripDraft; expectedRevision: number; editor: UserId; savedTrip: boolean }): Promise<CloudWorkspace | null> {
  await ensureSchema();
  const sql = getSql();
  const nextRevision = input.expectedRevision + 1;
  const rows = await sql`
    WITH saved AS (
      INSERT INTO beijing_play_workspaces (space_id, draft, revision, editor, saved_trip, updated_at)
      SELECT ${input.spaceId}, ${JSON.stringify(input.draft)}::jsonb, ${nextRevision}, ${input.editor}, ${input.savedTrip}, NOW()
      WHERE ${input.expectedRevision} = 0 OR EXISTS (
        SELECT 1 FROM beijing_play_workspaces WHERE space_id = ${input.spaceId} AND revision = ${input.expectedRevision}
      )
      ON CONFLICT (space_id) DO UPDATE SET
        draft = EXCLUDED.draft,
        revision = EXCLUDED.revision,
        editor = EXCLUDED.editor,
        saved_trip = EXCLUDED.saved_trip,
        updated_at = NOW()
      WHERE beijing_play_workspaces.revision = ${input.expectedRevision}
      RETURNING *
    ), versioned AS (
      INSERT INTO beijing_play_workspace_versions (space_id, draft, revision, editor, saved_trip)
      SELECT space_id, draft, revision, editor, saved_trip FROM saved
      RETURNING id
    )
    SELECT saved.*, versioned.id AS version_id FROM saved CROSS JOIN versioned
  `;
  const records = rows as Record<string, unknown>[];
  return records[0] ? normalize(records[0]) : null;
}
