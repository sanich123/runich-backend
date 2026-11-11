/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma ORM query builder is dynamically typed. */
import { and, not, or } from '@prisma/orm-postgres/orm-client';
import type { AnyRecord, ModelName } from './database-repository.metadata';
import { dateFields, relationModels } from './database-repository.metadata';

export function normalizeInput(model: ModelName, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalizeInput(model, item));
  if (!value || typeof value !== 'object') return value;

  const result: AnyRecord = {};
  for (const [key, nested] of Object.entries(value as AnyRecord)) {
    const nestedModel = relationModels[model][key];
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
    const nestedModel = relationModels[model][key];
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
    if (relationModels[model][key] && value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = normalizeInput(relationModels[model][key], value);
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
  const expressions: any[] = [];
  for (const [key, rawValue] of Object.entries(normalizeCriterion(model, where))) {
    if (key === 'OR' && Array.isArray(rawValue)) {
      expressions.push(or(...rawValue.map((item) => buildPredicate(fields, model, item))));
      continue;
    }
    if (key === 'AND' && Array.isArray(rawValue)) {
      expressions.push(and(...rawValue.map((item) => buildPredicate(fields, model, item))));
      continue;
    }
    if (key === 'NOT') {
      expressions.push(not(buildPredicate(fields, model, rawValue)));
      continue;
    }

    const relationModel = relationModels[model][key];
    if (relationModel && rawValue && typeof rawValue === 'object') {
      const relation = fields[key];
      const quantifiers = ['some', 'none', 'every'];
      const hasQuantifier = Object.keys(rawValue).some((candidate) => quantifiers.includes(candidate));
      if (!hasQuantifier && typeof relation?.some === 'function') {
        expressions.push(
          relation.some((nestedFields: AnyRecord) => buildPredicate(nestedFields, relationModel, rawValue)),
        );
        continue;
      }
      for (const [quantifier, nested] of Object.entries(rawValue as AnyRecord)) {
        if (typeof relation?.[quantifier] === 'function') {
          expressions.push(
            relation[quantifier]((nestedFields: AnyRecord) =>
              buildPredicate(nestedFields, relationModel, nested as AnyRecord),
            ),
          );
        }
      }
      continue;
    }

    const field = fields[key];
    if (!field) continue;
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
        expressions.push(normalizedOperand === null ? field.isNotNull() : not(field.eq(normalizedOperand)));
      }
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
  let result = collection;
  if (options.where && Object.keys(options.where).length > 0) {
    result = result.where((fields: AnyRecord) => buildPredicate(fields, model, options.where));
  }

  const select = options.select as AnyRecord | undefined;
  if (select) {
    const fields = Object.entries(select)
      .filter(([key, selected]) => selected === true && !relationModels[model][key])
      .map(([key]) => key);
    if (fields.length > 0) result = result.select(...fields);
  }

  const includes = { ...(options.include ?? {}) } as AnyRecord;
  if (select) {
    for (const [key, value] of Object.entries(select)) {
      if (key === '_count' || (value && typeof value === 'object' && relationModels[model][key])) {
        includes[key] = value;
      }
    }
  }
  for (const [relation, config] of Object.entries(includes)) {
    if (relation === '_count') {
      for (const [countRelation, countConfig] of Object.entries((config as AnyRecord)?.select ?? {})) {
        const childModel = relationModels[model][countRelation];
        if (!childModel || (countConfig !== true && (!countConfig || typeof countConfig !== 'object'))) continue;
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
    const childModel = relationModels[model][relation];
    if (!childModel) continue;
    result = result.include(relation, (branch: AnyRecord) =>
      applyOptions(branch, childModel, config === true ? undefined : config, countSpecs),
    );
  }

  if (options.orderBy) {
    const orderBy = Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy];
    result = result.orderBy(
      orderBy.map((item: AnyRecord) => (fields: AnyRecord) => {
        const [key, direction] = Object.entries(item)[0] as [string, string];
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
    const relationModel = relationModels[model][key];
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
