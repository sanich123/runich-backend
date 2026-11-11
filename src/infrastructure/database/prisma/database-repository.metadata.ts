/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma ORM runtime contract is dynamic. */
import type { PostgresClient } from '@prisma/orm-postgres/runtime';

export type AnyRecord = Record<string, any>;
export type RuntimeClient = PostgresClient<any>;
export type RawSqlBuilder = (strings: TemplateStringsArray, ...values: unknown[]) => AnyRecord;

export const SQL_CASTS: Record<string, string> = {
  'pg/bool': 'boolean',
  'pg/date-string': 'date',
  'pg/float8': 'float8',
  'pg/int2': 'int2',
  'pg/int4': 'int4',
  'pg/jsonb': 'jsonb',
  'pg/text': 'text',
  'pg/timestamptz-string': 'timestamptz',
  'pg/uuid': 'uuid',
  'sql/varchar': 'varchar',
};

export function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function getCodecId(modelSpec: AnyRecord, field: string) {
  return modelSpec.fields[field]?.type?.codecId as string | undefined;
}

export type ModelName =
  | 'User'
  | 'UserSession'
  | 'AuthExchange'
  | 'Profile'
  | 'Activity'
  | 'ActivityMedia'
  | 'ActivityMigrationJob'
  | 'Subscription'
  | 'MediaCleanupJob'
  | 'EmailNotificationJob'
  | 'Notification'
  | 'PushDeviceToken'
  | 'PushNotificationJob'
  | 'LoadTestSeedJob'
  | 'Friend'
  | 'Comment'
  | 'CommentLike'
  | 'Like'
  | 'ContentReport'
  | 'UserBlock'
  | 'ModerationAction'
  | 'ModerationAppeal'
  | 'MediaModerationAsset'
  | 'AdminRoleAssignment'
  | 'AdminAccessAudit'
  | 'Group'
  | 'GroupMember'
  | 'GroupPost'
  | 'GroupEvent';

export const relationModels: Record<ModelName, Record<string, ModelName>> = {
  User: {
    activities: 'Activity',
    activityMigrationJobs: 'ActivityMigrationJob',
    authExchanges: 'AuthExchange',
    friends: 'Friend',
    groupsCreated: 'Group',
    groupMemberships: 'GroupMember',
    groupPostsAuthored: 'GroupPost',
    groupEventsCreated: 'GroupEvent',
    profile: 'Profile',
    userSessions: 'UserSession',
    subscriptions: 'Subscription',
    receivedNotifications: 'Notification',
    sentNotifications: 'Notification',
    pushDeviceTokens: 'PushDeviceToken',
    adminRoleAssignments: 'AdminRoleAssignment',
    grantedAdminRoleAssignments: 'AdminRoleAssignment',
    adminAccessAuditAsActor: 'AdminAccessAudit',
    adminAccessAuditAsTarget: 'AdminAccessAudit',
  },
  Profile: {
    activities: 'Activity',
    activityMigrationJobs: 'ActivityMigrationJob',
    comments: 'Comment',
    commentLikes: 'CommentLike',
    friends: 'Friend',
    likes: 'Like',
    user: 'User',
  },
  Activity: { comments: 'Comment', likes: 'Like', media: 'ActivityMedia', profile: 'Profile', user: 'User' },
  ActivityMedia: { activity: 'Activity' },
  ActivityMigrationJob: { profile: 'Profile', user: 'User' },
  AuthExchange: { user: 'User' },
  Subscription: { user: 'User' },
  Comment: { activity: 'Activity', commentLikes: 'CommentLike', profile: 'Profile' },
  CommentLike: { comment: 'Comment', profile: 'Profile' },
  Friend: { profile: 'Profile', user: 'User' },
  Like: { activity: 'Activity', profile: 'Profile' },
  MediaCleanupJob: {},
  EmailNotificationJob: {},
  LoadTestSeedJob: {},
  UserSession: { user: 'User' },
  Notification: { recipient: 'User', actor: 'User', pushJob: 'PushNotificationJob' },
  PushDeviceToken: { user: 'User' },
  PushNotificationJob: { notification: 'Notification' },
  ContentReport: {},
  UserBlock: {},
  ModerationAction: {},
  ModerationAppeal: {},
  MediaModerationAsset: {},
  AdminRoleAssignment: { user: 'User', grantedBy: 'User' },
  AdminAccessAudit: { actor: 'User', target: 'User' },
  Group: {
    creator: 'User',
    members: 'GroupMember',
    posts: 'GroupPost',
    events: 'GroupEvent',
    photoAsset: 'MediaModerationAsset',
  },
  GroupMember: { group: 'Group', user: 'User' },
  GroupPost: { group: 'Group', author: 'User', photoAsset: 'MediaModerationAsset' },
  GroupEvent: { group: 'Group', creator: 'User' },
};

export const dateFields: Record<ModelName, ReadonlySet<string>> = {
  User: new Set([
    'emailConfirmedAt',
    'invitedAt',
    'confirmationSentAt',
    'recoverySentAt',
    'emailChangeSentAt',
    'lastSignInAt',
    'createdAt',
    'updatedAt',
    'phoneConfirmedAt',
    'phoneChangeSentAt',
    'bannedUntil',
    'reauthenticationSentAt',
    'deletedAt',
  ]),
  Profile: new Set(['createdAt', 'birthday', 'updatedAt']),
  Activity: new Set(['date', 'createdAt', 'updatedAt']),
  ActivityMedia: new Set(['activityDate', 'createdAt']),
  ActivityMigrationJob: new Set(['createdAt', 'startedAt', 'finishedAt']),
  AuthExchange: new Set(['expiresAt', 'consumedAt', 'createdAt']),
  Subscription: new Set(['startsAt', 'expiresAt', 'createdAt', 'updatedAt']),
  Comment: new Set(['date']),
  CommentLike: new Set(['date']),
  Friend: new Set(['createdAt', 'updatedAt']),
  Like: new Set(['date']),
  MediaCleanupJob: new Set(['createdAt', 'startedAt', 'finishedAt']),
  EmailNotificationJob: new Set(['availableAt', 'createdAt', 'startedAt', 'finishedAt']),
  LoadTestSeedJob: new Set(['createdAt', 'startedAt', 'finishedAt']),
  UserSession: new Set(['lastSeenAt', 'lastLocationAt', 'createdAt', 'revokedAt']),
  Notification: new Set(['createdAt', 'readAt']),
  PushDeviceToken: new Set(['createdAt', 'updatedAt']),
  PushNotificationJob: new Set(['availableAt', 'createdAt', 'startedAt', 'finishedAt']),
  ContentReport: new Set(['createdAt', 'reviewedAt']),
  UserBlock: new Set(['createdAt']),
  ModerationAction: new Set(['createdAt']),
  ModerationAppeal: new Set(['createdAt', 'reviewedAt']),
  MediaModerationAsset: new Set(['processingStartedAt', 'scannedAt', 'reviewedAt', 'createdAt']),
  AdminRoleAssignment: new Set(['createdAt', 'updatedAt']),
  AdminAccessAudit: new Set(['createdAt']),
  Group: new Set(['createdAt', 'updatedAt']),
  GroupMember: new Set(['requestedAt', 'joinedAt']),
  GroupPost: new Set(['createdAt']),
  GroupEvent: new Set(['startsAt', 'createdAt']),
};
