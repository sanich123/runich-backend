/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma ORM runtime contract is dynamic. */
import type { PostgresClient } from '@prisma/orm-postgres/runtime';
import type { CollectionRowOf } from '@prisma/orm-postgres/orm-client';
import type { Contract } from '../../../../prisma/contract';
import contractJson from '../../../../prisma/contract.json' with { type: 'json' };

export type AnyRecord = Record<string, any>;
export type RuntimeClient = PostgresClient<Contract>;
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
  | 'GroupEvent'
  | 'FeedbackRequest'
  | 'FeedbackReply';

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
  FeedbackRequest: new Set(['createdAt', 'updatedAt']),
  FeedbackReply: new Set(['createdAt']),
};

type RawModelRow<Model extends ModelName> = CollectionRowOf<RuntimeClient['orm']['public'][Model]>;
type ContractModel<Model extends ModelName> = Contract['domain']['namespaces']['public']['models'][Model];
type RelationDefinition<
  Model extends ModelName,
  Relation extends PropertyKey,
> = Relation extends keyof ContractModel<Model>['relations'] ? ContractModel<Model>['relations'][Relation] : never;
type RelationTarget<Definition> = Definition extends { to: { model: infer Target extends ModelName } } ? Target : never;
type RelationModelMap = {
  [Model in ModelName]: {
    [Relation in keyof ContractModel<Model>['relations']]: RelationTarget<RelationDefinition<Model, Relation>>;
  };
};

const repositoryModelNames = Object.keys(dateFields) as ModelName[];
// The generated contract is the source of truth for relation names and target models.
export const relationModels = Object.fromEntries(
  repositoryModelNames.map((model) => [
    model,
    Object.fromEntries(
      Object.entries(contractJson.domain.namespaces.public.models[model].relations).map(([relation, definition]) => [
        relation,
        definition.to.model,
      ]),
    ),
  ]),
) as RelationModelMap;
type ModelRelationName<Model extends ModelName> = keyof ContractModel<Model>['relations'] extends infer Relation
  ? Relation extends string
    ? [RelationTarget<RelationDefinition<Model, Relation>>] extends [never]
      ? never
      : Relation
    : never
  : never;
type RelationName<Model extends ModelName> = Model extends ModelName
  ? ModelRelationName<Model> & keyof (typeof relationModels)[Model] & string
  : never;
type RelatedModel<
  Model extends ModelName,
  Relation extends RelationName<Model>,
> = (typeof relationModels)[Model][Relation] & ModelName;
type IsManyRelation<Model extends ModelName, Relation extends RelationName<Model>> =
  RelationDefinition<Model, Relation> extends { cardinality: '1:N' | 'N:M' } ? true : false;
type IsNullableRelation<Model extends ModelName, Relation extends RelationName<Model>> =
  RelationDefinition<Model, Relation> extends { nullable: true } ? true : false;
type DateCodec = 'pg/date-string@1' | 'pg/timestamptz-string@1';
type DateFieldName<Model extends ModelName> = {
  [Field in keyof RawModelRow<Model>]: Field extends keyof ContractModel<Model>['fields']
    ? ContractModel<Model>['fields'][Field] extends { type: { codecId: DateCodec } }
      ? Field
      : never
    : never;
}[keyof RawModelRow<Model>];
type MutableResult<Value> = Value extends string & { readonly __varcharLength: number }
  ? string
  : Value extends string
    ? Value
    : Value extends readonly (infer Element)[]
      ? Array<MutableResult<Element>>
      : Value extends object
        ? { -readonly [Key in keyof Value]: MutableResult<Value[Key]> }
        : Value;
type WhereFieldValue<Model extends ModelName, Field extends keyof RawModelRow<Model>> =
  Field extends DateFieldName<Model>
    ? Date | Extract<RawModelRow<Model>[Field], null>
    : Exclude<RawModelRow<Model>[Field], null> extends string & { readonly __varcharLength: number }
      ? string | Extract<RawModelRow<Model>[Field], null>
      : RawModelRow<Model>[Field];
type RepositoryModelRow<Model extends ModelName> = {
  [Field in keyof RawModelRow<Model>]: Field extends DateFieldName<Model>
    ? null extends RawModelRow<Model>[Field]
      ? Date | null
      : Date
    : MutableResult<RawModelRow<Model>[Field]>;
};

type ScalarCondition<Value> =
  | Value
  | {
      equals?: Value;
      in?: readonly Value[];
      notIn?: readonly Value[];
      gt?: Value;
      gte?: Value;
      lt?: Value;
      lte?: Value;
      startsWith?: string;
      endsWith?: string;
      contains?: string;
      mode?: 'default' | 'insensitive';
      not?: Value | ScalarCondition<Value>;
    };

interface LogicalRepositoryWhere<Model extends ModelName> {
  AND?: RepositoryWhere<Model> | readonly RepositoryWhere<Model>[];
  OR?: RepositoryWhere<Model> | readonly RepositoryWhere<Model>[];
  NOT?: RepositoryWhere<Model> | readonly RepositoryWhere<Model>[];
}

export type RepositoryWhere<Model extends ModelName> = Partial<{
  [Field in keyof RawModelRow<Model>]: ScalarCondition<WhereFieldValue<Model, Field>>;
}> &
  LogicalRepositoryWhere<Model> &
  Partial<{
    [Relation in RelationName<Model>]: IsManyRelation<Model, Relation> extends true
      ? | RepositoryWhere<RelatedModel<Model, Relation>>
        | {
            some?: RepositoryWhere<RelatedModel<Model, Relation>>;
            none?: RepositoryWhere<RelatedModel<Model, Relation>>;
            every?: RepositoryWhere<RelatedModel<Model, Relation>>;
          }
      : | RepositoryWhere<RelatedModel<Model, Relation>>
        | {
            is?: RepositoryWhere<RelatedModel<Model, Relation>> | null;
            isNot?: RepositoryWhere<RelatedModel<Model, Relation>> | null;
          };
  }>;

type CompoundUniqueWhere<Model extends ModelName> = Partial<
  Record<`${keyof RawModelRow<Model> & string}_${string}`, Partial<Record<keyof RawModelRow<Model>, unknown>>>
>;
export type RepositoryUniqueWhere<Model extends ModelName> = RepositoryWhere<Model> | CompoundUniqueWhere<Model>;

type RelationSelection<Model extends ModelName> = Partial<{
  [Relation in RelationName<Model>]: boolean | RepositoryQueryOptions<RelatedModel<Model, Relation>>;
}>;
type CountSelection<Model extends ModelName> = {
  select?: Partial<{
    [Relation in RelationName<Model>]: true | { where?: RepositoryWhere<RelatedModel<Model, Relation>> };
  }>;
};

export type RepositorySelection<Model extends ModelName> = Partial<Record<keyof RawModelRow<Model>, boolean>> &
  RelationSelection<Model> & { _count?: CountSelection<Model> };

export type RepositoryQueryOptions<Model extends ModelName> = {
  where?: RepositoryWhere<Model>;
  select?: RepositorySelection<Model>;
  include?: RelationSelection<Model>;
  orderBy?:
    | Partial<Record<keyof RawModelRow<Model>, 'asc' | 'desc'>>
    | Array<Partial<Record<keyof RawModelRow<Model>, 'asc' | 'desc'>>>;
  take?: number;
  skip?: number;
};

export type RepositoryUniqueQueryOptions<Model extends ModelName> = Omit<RepositoryQueryOptions<Model>, 'where'> & {
  where: RepositoryUniqueWhere<Model>;
};

type RepositoryRelationMutation<Model extends ModelName, Relation extends RelationName<Model>> = {
  create?:
    RepositoryMutation<RelatedModel<Model, Relation>> | readonly RepositoryMutation<RelatedModel<Model, Relation>>[];
  connect?:
    | RepositoryUniqueWhere<RelatedModel<Model, Relation>>
    | readonly RepositoryUniqueWhere<RelatedModel<Model, Relation>>[];
};
export type RepositoryScalarMutation<Model extends ModelName> = Partial<Record<keyof RawModelRow<Model>, unknown>>;
export type RepositoryMutation<Model extends ModelName> = RepositoryScalarMutation<Model> &
  Partial<{
    [Relation in RelationName<Model>]: RepositoryRelationMutation<Model, Relation>;
  }>;

type SelectedScalarFields<Model extends ModelName, Selection> = Selection extends object
  ? {
      [Field in keyof Selection]: Field extends keyof RawModelRow<Model>
        ? Selection[Field] extends false | undefined
          ? never
          : Field
        : never;
    }[keyof Selection]
  : never;
type SelectedRelations<Model extends ModelName, Selection> = Selection extends object
  ? {
      [Relation in keyof Selection]: Relation extends RelationName<Model>
        ? Selection[Relation] extends false | undefined
          ? never
          : Relation
        : never;
    }[keyof Selection]
  : never;
type SelectedRelationValue<
  Model extends ModelName,
  Relation extends RelationName<Model>,
  Selection,
> = Selection extends true
  ? RepositoryModelRow<RelatedModel<Model, Relation>>
  : Selection extends RepositoryQueryOptions<RelatedModel<Model, Relation>>
    ? RepositoryQueryResult<RelatedModel<Model, Relation>, Selection>
    : RepositoryModelRow<RelatedModel<Model, Relation>>;
type SelectedRelationProperties<Model extends ModelName, Selection> = {
  [Relation in SelectedRelations<Model, Selection> & RelationName<Model>]: IsManyRelation<Model, Relation> extends true
    ? Array<SelectedRelationValue<Model, Relation, Selection[Relation]>>
    : | SelectedRelationValue<Model, Relation, Selection[Relation]>
      | (IsNullableRelation<Model, Relation> extends true ? null : never);
};
type SelectedCountProperties<Model extends ModelName, Selection> = Selection extends {
  _count: { select?: infer Counts };
}
  ? Counts extends object
    ? { _count: { [Relation in keyof Counts]: Relation extends RelationName<Model> ? number : never } }
    : { _count: Record<string, number> }
  : unknown;
type SelectedProperties<Model extends ModelName, Selection> = Pick<
  RepositoryModelRow<Model>,
  Extract<SelectedScalarFields<Model, Selection>, keyof RepositoryModelRow<Model>>
> &
  SelectedRelationProperties<Model, Selection> &
  SelectedCountProperties<Model, Selection>;
type IncludedRelationProperties<Model extends ModelName, Include> = Include extends object
  ? SelectedRelationProperties<Model, Include>
  : unknown;

export type RepositoryQueryResult<Model extends ModelName, Options extends object | undefined> = Options extends {
  select: infer Selection;
}
  ? SelectedProperties<Model, Selection>
  : RepositoryModelRow<Model> &
      (Options extends { include: infer Include } ? IncludedRelationProperties<Model, Include> : unknown);

export function getModelFieldNames(model: ModelName): ReadonlySet<string> {
  return new Set(Object.keys(contractJson.domain.namespaces.public.models[model].fields));
}

export function getRelationModel(model: ModelName, relation: string): ModelName | undefined {
  const relations: Readonly<Record<string, ModelName>> = relationModels[model];
  return relations[relation];
}

const compoundUniqueSelectorCache = new Map<ModelName, ReadonlyMap<string, ReadonlySet<string>>>();

export function getCompoundUniqueSelectorFields(model: ModelName): ReadonlyMap<string, ReadonlySet<string>> {
  const cached = compoundUniqueSelectorCache.get(model);
  if (cached) return cached;

  // The emitted Prisma JSON is a generated runtime boundary; normalize its physical columns to domain field names here.
  const modelSpec = contractJson.domain.namespaces.public.models[model] as unknown as {
    storage: { table: string; fields: Record<string, { column: string }> };
  };
  const tables = contractJson.storage.namespaces.public.entries.table as unknown as Record<
    string,
    { uniques: Array<{ columns: string[] }> }
  >;
  const tableSpec = tables[modelSpec.storage.table];
  const fieldByColumn = new Map(Object.entries(modelSpec.storage.fields).map(([field, spec]) => [spec.column, field]));
  const selectors = new Map<string, ReadonlySet<string>>();
  for (const unique of tableSpec.uniques) {
    const fields = unique.columns.map((column) => fieldByColumn.get(column));
    if (fields.length < 2 || fields.some((field) => field === undefined)) continue;
    selectors.set(fields.join('_'), new Set(fields as string[]));
  }
  compoundUniqueSelectorCache.set(model, selectors);
  return selectors;
}
