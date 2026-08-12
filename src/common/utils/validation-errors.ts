import type { ValidationError } from 'class-validator';

type ConstraintFormatter = (property: string, constraint: string) => string;

const constraintFormatters: Record<string, ConstraintFormatter> = {
  isDefined: (property) => `Не указано обязательное свойство: ${property}`,
  isNotEmpty: (property) => `Обязательное свойство не заполнено: ${property}`,
  isString: (property) => `Свойство должно быть строкой: ${property}`,
  isEmail: (property) => `Некорректный адрес электронной почты: ${property}`,
  isUUID: (property) => `Некорректный UUID: ${property}`,
  isInt: (property) => `Свойство должно быть целым числом: ${property}`,
  isNumber: (property) => `Свойство должно быть числом: ${property}`,
  isBoolean: (property) => `Свойство должно быть логическим значением: ${property}`,
  isArray: (property) => `Свойство должно быть массивом: ${property}`,
  isDateString: (property) => `Некорректная дата: ${property}`,
  minLength: (property, constraint) => {
    const length = constraint.match(/\d+/)?.[0];
    return length
      ? `Свойство должно содержать минимум ${length} символов: ${property}`
      : `Свойство слишком короткое: ${property}`;
  },
  matches: (property) => `Свойство содержит недопустимые символы: ${property}`,
  unknownValue: (property) => `Некорректное значение: ${property}`,
};

const constraintPriority = [
  'isDefined',
  'isNotEmpty',
  'isString',
  'isEmail',
  'isUUID',
  'isInt',
  'isNumber',
  'isBoolean',
  'isArray',
  'isDateString',
  'minLength',
  'matches',
  'unknownValue',
];

function formatProperty(parent: string, property: string) {
  if (!parent) return property;
  if (/^\d+$/.test(property)) return `${parent}[${property}]`;
  return `${parent}.${property}`;
}

function formatConstraint(property: string, constraints: Record<string, string>) {
  const constraintName = constraintPriority.find((name) => constraints[name]) ?? Object.keys(constraints)[0];
  if (!constraintName) return `Некорректное значение: ${property}`;

  const formatter = constraintFormatters[constraintName];
  return formatter ? formatter(property, constraints[constraintName]) : `Некорректное значение: ${property}`;
}

export function formatValidationErrors(errors: ValidationError[], parentProperty = ''): string[] {
  const messages = errors.flatMap((error) => {
    const property = formatProperty(parentProperty, error.property);
    const ownMessage = error.constraints ? [formatConstraint(property, error.constraints)] : [];
    const nestedMessages = error.children?.length ? formatValidationErrors(error.children, property) : [];
    return [...ownMessage, ...nestedMessages];
  });

  return [...new Set(messages)];
}
