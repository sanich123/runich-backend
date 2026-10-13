import { Client } from 'pg';

export type OperationalMetrics = {
  capturedAt: string;
  users: {
    total: number;
    new24h: number;
    active24h: number;
    active7d: number;
  };
  content: {
    profiles: number;
    activities: number;
    activities24h: number;
    comments24h: number;
    likes24h: number;
    follows24h: number;
  };
  queues: {
    mediaQueued: number;
    enrichmentQueued: number;
    importsQueued: number;
    importsProcessing: number;
    emailsQueued: number;
    emailsProcessing: number;
    failedJobs24h: number;
  };
  database: {
    sizeBytes: number;
    connections: number;
    maxConnections: number;
  };
};

type OperationalMetricsRow = Record<
  | 'users_total'
  | 'users_new_24h'
  | 'users_active_24h'
  | 'users_active_7d'
  | 'profiles_total'
  | 'activities_total'
  | 'activities_24h'
  | 'comments_24h'
  | 'likes_24h'
  | 'follows_24h'
  | 'media_queued'
  | 'enrichment_queued'
  | 'imports_queued'
  | 'imports_processing'
  | 'emails_queued'
  | 'emails_processing'
  | 'failed_jobs_24h'
  | 'database_size_bytes'
  | 'database_connections'
  | 'database_max_connections',
  string | number
>;

export const OPERATIONAL_METRICS_QUERY = `
SELECT
  (SELECT COUNT(*) FILTER (WHERE "deleted_at" IS NULL) FROM "Users") AS users_total,
  (SELECT COUNT(*) FILTER (WHERE "deleted_at" IS NULL AND "created_at" >= CURRENT_TIMESTAMP - INTERVAL '24 hours') FROM "Users") AS users_new_24h,
  (SELECT COUNT(DISTINCT sessions."user_id") FILTER (WHERE sessions."revoked_at" IS NULL AND sessions."last_seen_at" >= CURRENT_TIMESTAMP - INTERVAL '24 hours')
    FROM "UserSession" sessions JOIN "Users" users ON users."id" = sessions."user_id" WHERE users."deleted_at" IS NULL) AS users_active_24h,
  (SELECT COUNT(DISTINCT sessions."user_id") FILTER (WHERE sessions."revoked_at" IS NULL AND sessions."last_seen_at" >= CURRENT_TIMESTAMP - INTERVAL '7 days')
    FROM "UserSession" sessions JOIN "Users" users ON users."id" = sessions."user_id" WHERE users."deleted_at" IS NULL) AS users_active_7d,
  (SELECT COUNT(*) FROM "Profile") AS profiles_total,
  (SELECT COUNT(*) FROM "Activity") AS activities_total,
  (SELECT COUNT(*) FILTER (WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours') FROM "Activity") AS activities_24h,
  (SELECT COUNT(*) FILTER (WHERE "date" >= CURRENT_TIMESTAMP - INTERVAL '24 hours') FROM "Comment") AS comments_24h,
  (SELECT COUNT(*) FILTER (WHERE "date" >= CURRENT_TIMESTAMP - INTERVAL '24 hours') FROM "Like") AS likes_24h,
  (SELECT COUNT(*) FILTER (WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours') FROM "Friend") AS follows_24h,
  (SELECT COUNT(*) FILTER (WHERE "media_processing_status" = 'queued') FROM "Activity") AS media_queued,
  (SELECT COUNT(*) FILTER (WHERE "location_enrichment_status" = 'queued') FROM "Activity") AS enrichment_queued,
  (SELECT COUNT(*) FILTER (WHERE "status" = 'queued') FROM "ActivityMigrationJob") AS imports_queued,
  (SELECT COUNT(*) FILTER (WHERE "status" = 'processing') FROM "ActivityMigrationJob") AS imports_processing,
  (SELECT COUNT(*) FILTER (WHERE "status" = 'queued' AND "available_at" <= CURRENT_TIMESTAMP) FROM "EmailNotificationJob") AS emails_queued,
  (SELECT COUNT(*) FILTER (WHERE "status" = 'processing') FROM "EmailNotificationJob") AS emails_processing,
  (SELECT COUNT(*) FILTER (WHERE "status" = 'failed' AND "finishedAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours') FROM "ActivityMigrationJob")
    + (SELECT COUNT(*) FILTER (WHERE "status" = 'failed' AND "finishedAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours') FROM "MediaCleanupJob")
    + (SELECT COUNT(*) FILTER (WHERE "status" = 'failed' AND "finished_at" >= CURRENT_TIMESTAMP - INTERVAL '24 hours') FROM "EmailNotificationJob") AS failed_jobs_24h,
  pg_database_size(current_database()) AS database_size_bytes,
  COALESCE((SELECT numbackends FROM pg_stat_database WHERE datname = current_database()), 0) AS database_connections,
  current_setting('max_connections')::integer AS database_max_connections
`;

function parseMetric(value: string | number, name: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid operational metric ${name}: ${String(value)}`);
  }
  return parsed;
}

export async function collectOperationalMetrics(databaseUrl = process.env.DATABASE_URL): Promise<OperationalMetrics> {
  if (!databaseUrl) throw new Error('DATABASE_URL is required to collect operational metrics');

  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
    statement_timeout: 4_000,
  });

  await client.connect();
  try {
    const { rows } = await client.query<OperationalMetricsRow>(OPERATIONAL_METRICS_QUERY);
    const row = rows[0];
    if (!row) throw new Error('Operational metrics query returned no rows');

    return {
      capturedAt: new Date().toISOString(),
      users: {
        total: parseMetric(row.users_total, 'users_total'),
        new24h: parseMetric(row.users_new_24h, 'users_new_24h'),
        active24h: parseMetric(row.users_active_24h, 'users_active_24h'),
        active7d: parseMetric(row.users_active_7d, 'users_active_7d'),
      },
      content: {
        profiles: parseMetric(row.profiles_total, 'profiles_total'),
        activities: parseMetric(row.activities_total, 'activities_total'),
        activities24h: parseMetric(row.activities_24h, 'activities_24h'),
        comments24h: parseMetric(row.comments_24h, 'comments_24h'),
        likes24h: parseMetric(row.likes_24h, 'likes_24h'),
        follows24h: parseMetric(row.follows_24h, 'follows_24h'),
      },
      queues: {
        mediaQueued: parseMetric(row.media_queued, 'media_queued'),
        enrichmentQueued: parseMetric(row.enrichment_queued, 'enrichment_queued'),
        importsQueued: parseMetric(row.imports_queued, 'imports_queued'),
        importsProcessing: parseMetric(row.imports_processing, 'imports_processing'),
        emailsQueued: parseMetric(row.emails_queued, 'emails_queued'),
        emailsProcessing: parseMetric(row.emails_processing, 'emails_processing'),
        failedJobs24h: parseMetric(row.failed_jobs_24h, 'failed_jobs_24h'),
      },
      database: {
        sizeBytes: parseMetric(row.database_size_bytes, 'database_size_bytes'),
        connections: parseMetric(row.database_connections, 'database_connections'),
        maxConnections: parseMetric(row.database_max_connections, 'database_max_connections'),
      },
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export type OperationalMetricRow = { label: string; value: string };

const numberFormatter = new Intl.NumberFormat('ru-RU');

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${formatNumber(Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function getOperationalMetricRows(metrics: OperationalMetrics): OperationalMetricRow[] {
  return [
    { label: 'Users', value: `${formatNumber(metrics.users.total)} total, +${formatNumber(metrics.users.new24h)}/24h` },
    {
      label: 'Active users',
      value: `${formatNumber(metrics.users.active24h)}/24h, ${formatNumber(metrics.users.active7d)}/7d`,
    },
    { label: 'Profiles', value: formatNumber(metrics.content.profiles) },
    {
      label: 'Activities',
      value: `${formatNumber(metrics.content.activities)} total, +${formatNumber(metrics.content.activities24h)}/24h`,
    },
    {
      label: 'Engagement',
      value: `comments +${formatNumber(metrics.content.comments24h)}, likes +${formatNumber(metrics.content.likes24h)}, follows +${formatNumber(metrics.content.follows24h)}/24h`,
    },
    {
      label: 'Processing queues',
      value: `media ${formatNumber(metrics.queues.mediaQueued)}, enrichment ${formatNumber(metrics.queues.enrichmentQueued)}`,
    },
    {
      label: 'Import queue',
      value: `${formatNumber(metrics.queues.importsQueued)} queued, ${formatNumber(metrics.queues.importsProcessing)} processing`,
    },
    {
      label: 'Email queue',
      value: `${formatNumber(metrics.queues.emailsQueued)} queued, ${formatNumber(metrics.queues.emailsProcessing)} processing`,
    },
    { label: 'Failed jobs', value: `${formatNumber(metrics.queues.failedJobs24h)}/24h` },
    {
      label: 'Database',
      value: `${formatBytes(metrics.database.sizeBytes)}, ${formatNumber(metrics.database.connections)}/${formatNumber(metrics.database.maxConnections)} connections`,
    },
  ];
}

export function formatOperationalMetricsText(metrics: OperationalMetrics) {
  return [
    `Metrics captured: ${metrics.capturedAt}`,
    ...getOperationalMetricRows(metrics).map(({ label, value }) => `${label}: ${value}`),
  ].join('\n');
}
