/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma ORM query builder is dynamically typed. */
import { and, not, or } from '@prisma/orm-postgres/orm-client';
import type { AnyRecord, ModelName } from './database-repository.metadata';
import {
  dateFields,
  getCompoundUniqueSelectorFields,
  getModelFieldNames,
  getRelationModel,
} from './database-repository.metadata';

const LOGICAL_OPERATORS = new Set(['AND', 'OR', 'NOT']);
const RELATION_FILTER_OPERATORS = new Set(['some', 'none', 'every', 'is', 'isNot']);
const SCALAR_FILTER_OPERATORS = new Set([
  'equals',
  'in',
  'notIn',
  'gt',
  'gte',
  'lt',
  'lte',
  'startsWith',
  'endsWith',
  'contains',
  'mode',
  'not',
]);
const QUERY_OPTION_KEYS = new Set([
  'where',
  'select',
  'include',
  'orderBy',
  'take',
  'skip',
  'data',
  'create',
  'update',
  'skipDuplicates',
]);

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date));
}

function assertRecord(value: unknown, context: string): asserts value is AnyRecord {
  if (!isRecord(value)) throw new TypeError(`${context} must be an object`);
}

function assertKnownWhere(model: ModelName, where: unknown, context = `${model}.where`): asserts where is AnyRecord {
  assertRecord(where, context);
  const fields = getModelFieldNames(model);

  for (const [key, value] of Object.entries(where)) {
    if (LOGICAL_OPERATORS.has(key)) {
      if (key === 'NOT') {
        if (Array.isArray(value)) {
          value.forEach((nested, index) => assertKnownWhere(model, nested, `${context}.NOT[${index}]`));
        } else {
          assertKnownWhere(model, value, `${context}.NOT`);
        }
      } else {
        const nestedConditions = Array.isArray(value) ? value : [value];
        nestedConditions.forEach((nested, index) => assertKnownWhere(model, nested, `${context}.${key}[${index}]`));
      }
      continue;
    }

    const compoundFields = getCompoundUniqueSelectorFields(model).get(key);
    if (compoundFields && isRecord(value)) {
      if (
        Object.keys(value).length !== compoundFields.size ||
        Object.keys(value).some((field) => !compoundFields.has(field))
      ) {
        throw new TypeError(`Invalid compound unique selector in ${context}: ${key}`);
      }
      assertKnownWhere(model, value, `${context}.${key}`);
      continue;
    }

    const relatedModel = getRelationModel(model, key);
    if (relatedModel) {
      assertRecord(value, `${context}.${key}`);
      const entries = Object.entries(value);
      const hasRelationOperator = entries.some(([operator]) => RELATION_FILTER_OPERATORS.has(operator));
      if (!hasRelationOperator) {
        assertKnownWhere(relatedModel, value, `${context}.${key}`);
        continue;
      }
      for (const [operator, nested] of entries) {
        if (!RELATION_FILTER_OPERATORS.has(operator)) {
          throw new TypeError(`Unsupported relation filter ${context}.${key}.${operator}`);
        }
        if (nested !== null) assertKnownWhere(relatedModel, nested, `${context}.${key}.${operator}`);
      }
      continue;
    }

    if (!fields.has(key)) throw new TypeError(`Unknown field in ${context}: ${key}`);
    if (!isRecord(value)) continue;
    for (const operator of Object.keys(value)) {
      if (!SCALAR_FILTER_OPERATORS.has(operator)) {
        throw new TypeError(`Unsupported scalar filter ${context}.${key}.${operator}`);
      }
    }
    if ('mode' in value && value.mode !== 'default' && value.mode !== 'insensitive') {
      throw new TypeError(`Unsupported text filter mode in ${context}.${key}`);
    }
    if (Object.keys(value).every((operator) => operator === 'mode')) {
      throw new TypeError(`Filter mode requires a text predicate in ${context}.${key}`);
    }
  }
}

function assertMutationFields(model: ModelName, value: unknown, context: string) {
  assertRecord(value, context);
  const fields = getModelFieldNames(model);
  for (const [key, nested] of Object.entries(value)) {
    if (!fields.has(key) && !getRelationModel(model, key)) {
      throw new TypeError(`Unknown field in ${context}: ${key}`);
    }
    const relatedModel = getRelationModel(model, key);
    if (!relatedModel || !isRecord(nested)) continue;
    const mutationKeys = Object.keys(nested);
    if (mutationKeys.some((mutation) => mutation !== 'create' && mutation !== 'connect')) {
      throw new TypeError(`Unsupported relation mutation in ${context}.${key}`);
    }
    for (const mutation of mutationKeys) {
      const relatedData = nested[mutation];
      const relatedItems = Array.isArray(relatedData) ? relatedData : [relatedData];
      relatedItems.forEach((item, index) =>
        assertMutationFields(relatedModel, item, `${context}.${key}.${mutation}[${index}]`),
      );
    }
  }
}

function assertQueryOptions(model: ModelName, options: AnyRecord | undefined) {
  if (!options) return;
  for (const key of Object.keys(options)) {
    if (!QUERY_OPTION_KEYS.has(key)) throw new TypeError(`Unsupported query option ${model}.${key}`);
  }
  if (options.where !== undefined) assertKnownWhere(model, options.where);
  if (options.data !== undefined) assertMutationFields(model, options.data, `${model}.data`);
  if (options.create !== undefined) assertMutationFields(model, options.create, `${model}.create`);
  if (options.update !== undefined) assertMutationFields(model, options.update, `${model}.update`);
  for (const key of ['select', 'include'] as const) {
    const selection = options[key];
    if (selection === undefined) continue;
    assertRecord(selection, `${model}.${key}`);
    for (const [field, config] of Object.entries(selection)) {
      if (field === '_count' && key === 'select') {
        assertRecord(config, `${model}.${key}._count`);
        const countSelection = config.select;
        if (countSelection === undefined) continue;
        assertRecord(countSelection, `${model}.${key}._count.select`);
        for (const [relation, countConfig] of Object.entries(countSelection)) {
          const relatedModel = getRelationModel(model, relation);
          if (!relatedModel) throw new TypeError(`Unknown relation in ${model}._count: ${relation}`);
          if (countConfig === true) continue;
          assertRecord(countConfig, `${model}._count.${relation}`);
          for (const option of Object.keys(countConfig)) {
            if (option !== 'where')
              throw new TypeError(`Unsupported count option ${model}._count.${relation}.${option}`);
          }
          if (countConfig.where !== undefined)
            assertKnownWhere(relatedModel, countConfig.where, `${model}._count.${relation}.where`);
        }
        continue;
      }
      if (getModelFieldNames(model).has(field)) {
        if (config !== true && config !== false) throw new TypeError(`Invalid scalar selection ${model}.${field}`);
        continue;
      }
      const relatedModel = getRelationModel(model, field);
      if (!relatedModel) throw new TypeError(`Unknown relation in ${model}.${key}: ${field}`);
      if (config === true || config === false) continue;
      assertRecord(config, `${model}.${key}.${field}`);
      assertQueryOptions(relatedModel, config);
    }
  }
  if (options.orderBy !== undefined) {
    const orderItems = Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy];
    orderItems.forEach((item, index) => {
      assertRecord(item, `${model}.orderBy[${index}]`);
      const entries = Object.entries(item);
      if (entries.length !== 1) throw new TypeError(`${model}.orderBy entries must contain one field`);
      const [field, direction] = entries[0]!;
      if (!getModelFieldNames(model).has(field)) throw new TypeError(`Unknown order field in ${model}: ${field}`);
      if (direction !== 'asc' && direction !== 'desc')
        throw new TypeError(`Invalid order direction in ${model}.${field}`);
    });
  }
  for (const key of ['take', 'skip'] as const) {
    if (options[key] !== undefined && (!Number.isSafeInteger(options[key]) || (key === 'skip' && options[key] < 0))) {
      throw new TypeError(`Invalid ${key} value in ${model} query`);
    }
  }
}

export function validateCreateManyOptions(model: ModelName, options: AnyRecord) {
  for (const key of Object.keys(options)) {
    if (key !== 'data' && key !== 'skipDuplicates') {
      throw new TypeError(`Unsupported createMany option ${model}.${key}`);
    }
  }
  if (!Array.isArray(options.data)) throw new TypeError(`${model}.createMany.data must be an array`);
  if (options.skipDuplicates !== undefined && typeof options.skipDuplicates !== 'boolean') {
    throw new TypeError(`${model}.createMany.skipDuplicates must be a boolean`);
  }
  const fields = getModelFieldNames(model);
  options.data.forEach((row: unknown, index: number) => {
    const context = `${model}.createMany.data[${index}]`;
    assertRecord(row, context);
    for (const field of Object.keys(row)) {
      if (!fields.has(field)) throw new TypeError(`Unknown scalar field in ${context}: ${field}`);
    }
  });
}

export function normalizeInput(model: ModelName, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalizeInput(model, item));
  if (!value || typeof value !== 'object') return value;

  const result: AnyRecord = {};
  for (const [key, nested] of Object.entries(value as AnyRecord)) {
    const nestedModel = getRelationModel(model, key);
    result[key] = nestedModel ? normalizeInput(nestedModel, nested) : normalizeInput(model, nested);
  }
  return result;
}

export function normalizeMutationInput(model: ModelName, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalizeMutationInput(model, item));
  if (!value || typeof value !== 'object') return value;

  const result: AnyRecord = {};
  for (const [key, nested] of Object.entries(value as AnyRecord)) {
    const nestedModel = getRelationModel(model, key);
    if (nestedModel && nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const mutation = nested as AnyRecord;
      if ('create' in mutation) {
        result[key] = (relation: AnyRecord) => relation.create(normalizeMutationInput(nestedModel, mutation.create));
        continue;
      }
      if ('connect' in mutation) {
        result[key] = (relation: AnyRecord) => relation.connect(normalizeCriterion(nestedModel, mutation.connect));
        continue;
      }
    }
    result[key] = normalizeMutationInput(nestedModel ?? model, nested);
  }

  if ((model === 'Activity' || model === 'Friend' || model === 'Subscription') && result.updatedAt === undefined) {
    result.updatedAt = new Date().toISOString();
  }
  return result;
}

export function normalizeCriterion(model: ModelName, where: AnyRecord | undefined): AnyRecord {
  if (!where) return {};
  const result: AnyRecord = {};
  for (const [key, value] of Object.entries(where)) {
    const relatedModel = getRelationModel(model, key);
    if (relatedModel && value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = normalizeInput(relatedModel, value);
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && key.includes('_')) {
      Object.assign(result, normalizeCriterion(model, value));
      continue;
    }
    result[key] = normalizeInput(model, value);
  }
  return result;
}

export function buildPredicate(fields: AnyRecord, model: ModelName, where: AnyRecord): any {
  assertKnownWhere(model, where);
  const expressions: any[] = [];
  for (const [key, rawValue] of Object.entries(normalizeCriterion(model, where))) {
    if (key === 'OR' || key === 'AND') {
      const conditions = Array.isArray(rawValue) ? rawValue : [rawValue];
      const nestedExpressions = conditions.map((item) => buildPredicate(fields, model, item));
      expressions.push(key === 'OR' ? or(...nestedExpressions) : and(...nestedExpressions));
      continue;
    }
    if (key === 'NOT') {
      const conditions = Array.isArray(rawValue) ? rawValue : [rawValue];
      expressions.push(and(...conditions.map((item) => not(buildPredicate(fields, model, item)))));
      continue;
    }

    const relationModel = getRelationModel(model, key);
    if (relationModel && rawValue && typeof rawValue === 'object') {
      const relation = fields[key];
      const relationEntries = Object.entries(rawValue as AnyRecord);
      const hasQuantifier = relationEntries.some(([candidate]) => RELATION_FILTER_OPERATORS.has(candidate));
      if (!hasQuantifier) {
        const predicate = typeof relation?.some === 'function' ? relation.some : relation?.is;
        if (typeof predicate !== 'function') throw new TypeError(`Relation filter is unavailable: ${model}.${key}`);
        expressions.push(predicate((nestedFields: AnyRecord) => buildPredicate(nestedFields, relationModel, rawValue)));
        continue;
      }
      for (const [quantifier, nested] of relationEntries) {
        const relationFilter = relation?.[quantifier];
        if (typeof relationFilter !== 'function') {
          throw new TypeError(`Unsupported relation filter ${model}.${key}.${quantifier}`);
        }
        if (nested === null) expressions.push(relationFilter(null));
        else {
          expressions.push(
            relationFilter((nestedFields: AnyRecord) =>
              buildPredicate(nestedFields, relationModel, nested as AnyRecord),
            ),
          );
        }
      }
      continue;
    }

    const field = fields[key];
    if (!field) throw new TypeError(`Unknown query field: ${model}.${key}`);
    if (rawValue === null) {
      expressions.push(field.isNull());
      continue;
    }
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
      expressions.push(field.eq(rawValue));
      continue;
    }

    const textMatch = (pattern: string) =>
      rawValue.mode === 'insensitive' && typeof field.ilike === 'function' ? field.ilike(pattern) : field.like(pattern);
    for (const [operator, operand] of Object.entries(rawValue as AnyRecord)) {
      if (operator === 'mode') continue;
      const normalizedOperand = normalizeInput(model, operand);
      if (operator === 'equals') expressions.push(field.eq(normalizedOperand));
      else if (operator === 'in') expressions.push(field.in(normalizedOperand));
      else if (operator === 'notIn') expressions.push(not(field.in(normalizedOperand)));
      else if (operator === 'gt' || operator === 'gte' || operator === 'lt' || operator === 'lte') {
        expressions.push(field[operator](normalizedOperand));
      } else if (operator === 'startsWith') expressions.push(textMatch(`${normalizedOperand}%`));
      else if (operator === 'endsWith') expressions.push(textMatch(`%${normalizedOperand}`));
      else if (operator === 'contains') expressions.push(textMatch(`%${normalizedOperand}%`));
      else if (operator === 'not') {
        if (isRecord(normalizedOperand)) throw new TypeError(`Nested not filters are unsupported: ${model}.${key}`);
        expressions.push(normalizedOperand === null ? field.isNotNull() : not(field.eq(normalizedOperand)));
      } else throw new TypeError(`Unsupported scalar filter ${model}.${key}.${operator}`);
    }
  }
  return expressions.length === 1 ? expressions[0] : and(...expressions);
}

export type CountSpec = { relation: string };

export function applyOptions(
  collection: AnyRecord,
  model: ModelName,
  options: AnyRecord | undefined,
  countSpecs: CountSpec[],
): AnyRecord {
  if (!options) return collection;
  assertQueryOptions(model, options);
  let result = collection;
  if (options.where && Object.keys(options.where).length > 0) {
    result = result.where((fields: AnyRecord) => buildPredicate(fields, model, options.where));
  }

  const select = options.select as AnyRecord | undefined;
  if (select) {
    const fields = Object.entries(select)
      .filter(([key, selected]) => selected === true && !getRelationModel(model, key))
      .map(([key]) => key);
    if (fields.length > 0) result = result.select(...fields);
  }

  const includes = { ...(options.include ?? {}) } as AnyRecord;
  if (select) {
    for (const [key, value] of Object.entries(select)) {
      if (
        key === '_count' ||
        (getRelationModel(model, key) && (value === true || (value && typeof value === 'object')))
      ) {
        includes[key] = value;
      }
    }
  }
  for (const [relation, config] of Object.entries(includes)) {
    if (relation === '_count') {
      for (const [countRelation, countConfig] of Object.entries((config as AnyRecord)?.select ?? {})) {
        const childModel = getRelationModel(model, countRelation);
        if (!childModel || (countConfig !== true && (!countConfig || typeof countConfig !== 'object'))) {
          throw new TypeError(`Unknown relation count ${model}.${countRelation}`);
        }
        const countWhere = countConfig === true ? undefined : (countConfig as AnyRecord).where;
        result = result.include(countRelation, (branch: AnyRecord) =>
          (countWhere
            ? branch.where((fields: AnyRecord) => buildPredicate(fields, childModel, countWhere))
            : branch
          ).count(),
        );
        countSpecs.push({ relation: countRelation });
      }
      continue;
    }
    const childModel = getRelationModel(model, relation);
    if (!childModel) throw new TypeError(`Unknown included relation ${model}.${relation}`);
    result = result.include(relation, (branch: AnyRecord) =>
      applyOptions(branch, childModel, config === true ? undefined : config, countSpecs),
    );
  }

  if (options.orderBy) {
    const orderBy = Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy];
    result = result.orderBy(
      orderBy.map((item: AnyRecord) => (fields: AnyRecord) => {
        const [key, direction] = Object.entries(item)[0] as [string, string];
        if (direction !== 'asc' && direction !== 'desc') {
          throw new TypeError(`Invalid order direction: ${model}.${key}.${direction}`);
        }
        if (typeof fields[key]?.[direction] !== 'function') throw new TypeError(`Unknown order field: ${model}.${key}`);
        return fields[key][direction]();
      }),
    );
  }
  if (typeof options.skip === 'number') result = result.offset(options.skip);
  if (typeof options.take === 'number') result = result.limit(Math.abs(options.take));
  return result;
}

export function normalizeOutput(model: ModelName, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeOutput(model, item));
  if (!value || typeof value !== 'object') return value;
  const result: AnyRecord = {};
  for (const [key, nested] of Object.entries(value as AnyRecord)) {
    if (key === '_count') {
      result[key] = nested;
      continue;
    }
    const relationModel = getRelationModel(model, key);
    const converted = relationModel ? normalizeOutput(relationModel, nested) : nested;
    result[key] = dateFields[model].has(key) && typeof converted === 'string' ? new Date(converted) : converted;
  }
  return result;
}

export function restoreCountShape(row: unknown, countSpecs: CountSpec[]): unknown {
  if (!row || typeof row !== 'object' || Array.isArray(row) || countSpecs.length === 0) return row;
  const output: AnyRecord = { ...(row as AnyRecord), _count: {} };
  for (const spec of countSpecs) {
    output._count[spec.relation] = output[spec.relation];
    delete output[spec.relation];
  }
  return output;
}
