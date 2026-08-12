import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActivityDto } from 'src/activity/activity.dto';
import { RegisterUserDto } from 'src/auth/auth.dto';
import { formatValidationErrors } from './validation-errors';

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
});
