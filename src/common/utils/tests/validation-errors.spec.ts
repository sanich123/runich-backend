import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActivityDto } from 'src/activity/activity.dto';
import { RegisterUserDto } from 'src/auth/dto/auth.dto';
import { formatValidationErrors } from '../validation-errors';

describe('formatValidationErrors', () => {
  it('names missing top-level properties', async () => {
    const errors = await validate(plainToInstance(ActivityDto, {}));

    expect(formatValidationErrors(errors)).toEqual(
      expect.arrayContaining([
        'Обязательное свойство не заполнено: duration',
        'Обязательное свойство не заполнено: distance',
        'Обязательное свойство не заполнено: speed',
        'Обязательное свойство не заполнено: sport',
      ]),
    );
  });

  it('names invalid nested properties', async () => {
    const errors = await validate(
      plainToInstance(ActivityDto, {
        duration: 1,
        distance: 1,
        speed: 1,
        sport: 'run',
        photoVideoUrls: [{ url: 'photo' }],
        locations: [{ coords: { latitude: '55.75', longitude: 37.61 } }],
      }),
    );

    expect(formatValidationErrors(errors)).toEqual(
      expect.arrayContaining([
        'Не указано обязательное свойство: photoVideoUrls[0].thumbnail',
        'Свойство должно быть числом: locations[0].coords.latitude',
      ]),
    );
  });

  it('uses concise Russian messages for authentication fields', async () => {
    const errors = await validate(plainToInstance(RegisterUserDto, { email: 'wrong', password: 'short' }));
    const messages = formatValidationErrors(errors);

    expect(messages).toEqual(
      expect.arrayContaining([
        'Некорректный адрес электронной почты: email',
        'Свойство должно содержать минимум 6 символов: password',
      ]),
    );
  });

  it('formats every supported constraint and nested array path', () => {
    const errors = [
      { property: 'defined', constraints: { isDefined: 'required' } },
      { property: 'empty', constraints: { isNotEmpty: 'required' } },
      { property: 'string', constraints: { isString: 'string' } },
      { property: 'email', constraints: { isEmail: 'email' } },
      { property: 'uuid', constraints: { isUUID: 'uuid' } },
      { property: 'int', constraints: { isInt: 'int' } },
      { property: 'number', constraints: { isNumber: 'number' } },
      { property: 'boolean', constraints: { isBoolean: 'boolean' } },
      { property: 'array', constraints: { isArray: 'array' } },
      { property: 'date', constraints: { isDateString: 'date' } },
      { property: 'short', constraints: { minLength: '6' } },
      { property: 'matches', constraints: { matches: 'matches' } },
      { property: 'unknown', constraints: { unknownValue: 'unknown' } },
      {
        property: 'items',
        children: [{ property: '0', constraints: { custom: 'invalid' } }],
      },
    ] as never;

    expect(formatValidationErrors(errors)).toEqual([
      'Не указано обязательное свойство: defined',
      'Обязательное свойство не заполнено: empty',
      'Свойство должно быть строкой: string',
      'Некорректный адрес электронной почты: email',
      'Некорректный UUID: uuid',
      'Свойство должно быть целым числом: int',
      'Свойство должно быть числом: number',
      'Свойство должно быть логическим значением: boolean',
      'Свойство должно быть массивом: array',
      'Некорректная дата: date',
      'Свойство должно содержать минимум 6 символов: short',
      'Свойство содержит недопустимые символы: matches',
      'Некорректное значение: unknown',
      'Некорректное значение: items[0]',
    ]);
  });
});
