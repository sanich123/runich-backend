import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AccessTokenDto,
  ChangePasswordDto,
  ConfirmationCodeDto,
  EmailLoginLinkDto,
  GetEmailCodeForPasswordDto,
  PasswordChangeCodeDto,
  RefreshTokenDto,
  RegisterUserDto,
} from './auth/auth.dto';
import { UserIdParamsDto } from './auth/auth.params.dto';
import { ActivityDto } from './activity/activity.dto';
import { CommentDTO, CommentLikeDto, CommentUpdateDto } from './comment/comment.dto';
import { EmailDTO, CommentEmailDTO, CommentLikeEmailDTO, LikeEmailDTO } from './email/email.dto';
import { FriendDto } from './friend/friend.dto';
import { LikeDto } from './like/like.dto';
import { ParamsId } from './common/dto/params-validation';
import { UserDto } from './user/user.dto';

const uuid = '11111111-1111-4111-8111-111111111111';
const email = 'runner@example.com';

type DtoConstructor = new () => object;

async function expectValid(dto: DtoConstructor, payload: unknown) {
  const errors = await validate(plainToInstance(dto, payload));
  expect(errors).toHaveLength(0);
}

async function expectInvalid(dto: DtoConstructor, payload: unknown) {
  const errors = await validate(plainToInstance(dto, payload));
  expect(errors.length).toBeGreaterThan(0);
}

describe('request DTO validation', () => {
  it('validates authentication DTOs and rejects missing, malformed and wrong-type values', async () => {
    await expectValid(RegisterUserDto, { email, password: 'secret123' });
    await expectInvalid(RegisterUserDto, {});
    await expectInvalid(RegisterUserDto, { email: 'not-an-email', password: 'secret123' });
    await expectInvalid(RegisterUserDto, { email, password: 'short' });
    await expectInvalid(RegisterUserDto, { email, password: 12345678 });

    for (const dto of [AccessTokenDto, RefreshTokenDto]) {
      await expectValid(dto, { [dto === AccessTokenDto ? 'accessToken' : 'refreshToken']: 'token' });
      await expectInvalid(dto, {});
      await expectInvalid(dto, { [dto === AccessTokenDto ? 'accessToken' : 'refreshToken']: '' });
      await expectInvalid(dto, { [dto === AccessTokenDto ? 'accessToken' : 'refreshToken']: 42 });
    }

    await expectValid(ConfirmationCodeDto, { confirmationCode: '123456', email });
    await expectInvalid(ConfirmationCodeDto, { confirmationCode: '123456', email: 'bad' });
    await expectInvalid(ConfirmationCodeDto, { confirmationCode: 123456, email });
    await expectValid(GetEmailCodeForPasswordDto, { email });
    await expectValid(EmailLoginLinkDto, { email });
    await expectInvalid(GetEmailCodeForPasswordDto, { email: '' });
    await expectInvalid(EmailLoginLinkDto, { email: 'bad' });

    const passwordChange = { password1: 'NewPassword1', password2: 'NewPassword1', email };
    await expectValid(ChangePasswordDto, passwordChange);
    await expectInvalid(ChangePasswordDto, { ...passwordChange, password1: 'weakpass' });
    await expectInvalid(ChangePasswordDto, { ...passwordChange, password2: 'weakpass' });
    await expectInvalid(ChangePasswordDto, { ...passwordChange, email: 'bad' });
    await expectValid(PasswordChangeCodeDto, { confirmationCode: '123456', email });
    await expectInvalid(PasswordChangeCodeDto, { confirmationCode: '', email });
  });

  it('validates profile DTO optional fields and preserves nullable profile values', async () => {
    await expectValid(UserDto, {});
    await expectValid(UserDto, {
      name: 'Ann',
      surname: 'Runner',
      bio: 'Morning runs',
      birthday: '1990-01-02',
      city: 'Moscow',
      gender: 'female',
      profilePhoto: 'https://example.com/photo.jpg',
      profilePhotoBlurhash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH',
      sport: 'run',
      weight: '65',
      emailNotifications: false,
      email,
      language: 'en',
    });
    await expectValid(UserDto, { name: null, birthday: null, email: null, emailNotifications: null });
    await expectInvalid(UserDto, { birthday: '02.01.1990' });
    await expectInvalid(UserDto, { email: 'bad' });
    await expectInvalid(UserDto, { emailNotifications: 'false' });
    await expectInvalid(UserDto, { weight: 65 });
  });

  it('validates activity scalar fields and every nested activity collection', async () => {
    await expectValid(ActivityDto, { duration: 100, distance: 1000, speed: 10, sport: 'run' });
    await expectValid(ActivityDto, {
      duration: 33374,
      distance: 5.029430600013118,
      speed: 110.36,
      sport: 'run',
    });
    await expectValid(ActivityDto, {
      duration: 100,
      distance: 1000,
      speed: 10,
      sport: 'run',
      date: '2026-08-12T10:00:00.000Z',
      description: 'Morning run',
      emotion: 'happy',
      isPublic: true,
      photoVideoUrls: [{ url: 'https://example.com/photo.jpg', thumbnail: null, blurhash: 'hash' }],
      mapPhotoUrl: 'https://example.com/map.jpg',
      mapPhotoUrlBlurhash: 'hash',
      title: 'Morning',
      locations: [{ coords: { latitude: 55.75, longitude: 37.61, speed: 3, mocked: false } }],
      kilometresSplit: [
        {
          lastKilometerDuration: 300,
          lastKilometerAltitude: 10,
          kilometerPoint: { coords: { latitude: 55.75, longitude: 37.61 } },
        },
      ],
    });
    await expectInvalid(ActivityDto, {});
    await expectInvalid(ActivityDto, { duration: 1.5, distance: 1, speed: 1, sport: 'run' });
    await expectInvalid(ActivityDto, { duration: 1, distance: 1, speed: 1, sport: 'run', date: 'yesterday' });
    await expectInvalid(ActivityDto, { duration: 1, distance: 1, speed: 1, sport: 'run', isPublic: 'true' });
    await expectInvalid(ActivityDto, {
      duration: 1,
      distance: 1,
      speed: 1,
      sport: 'run',
      photoVideoUrls: [{ url: 42 }],
    });
    await expectInvalid(ActivityDto, {
      duration: 1,
      distance: 1,
      speed: 1,
      sport: 'run',
      photoVideoUrls: [{ url: 'photo' }],
    });
    await expectInvalid(ActivityDto, {
      duration: 1,
      distance: 1,
      speed: 1,
      sport: 'run',
      locations: [{ coords: { latitude: '55.75', longitude: 37.61 } }],
    });
    await expectInvalid(ActivityDto, {
      duration: 1,
      distance: 1,
      speed: 1,
      sport: 'run',
      kilometresSplit: [{ lastKilometerDuration: 300, lastKilometerAltitude: 10 }],
    });
  });

  it('validates social, comment and email DTOs', async () => {
    await expectValid(CommentDTO, { comment: 'Nice activity', authorId: uuid });
    await expectValid(CommentUpdateDto, { comment: 'Updated comment' });
    await expectValid(CommentLikeDto, { commentId: uuid, authorId: uuid });
    await expectValid(FriendDto, { userId: uuid });
    await expectValid(LikeDto, { activityId: uuid, authorId: uuid });

    for (const dto of [CommentDTO, CommentUpdateDto]) {
      await expectInvalid(dto, { comment: '' });
      await expectInvalid(dto, { comment: 42 });
    }
    await expectInvalid(CommentDTO, { comment: 'text', authorId: 'user-1' });
    await expectInvalid(CommentLikeDto, { commentId: uuid, authorId: 'user-1' });
    await expectInvalid(FriendDto, { userId: 'user-1' });
    await expectInvalid(LikeDto, { activityId: uuid, authorId: 'user-1' });

    const baseEmail = {
      name: 'Ann',
      surname: 'Runner',
      profilePhoto: 'https://example.com/profile.jpg',
      recepientName: 'Bob',
      recepientSurname: 'Runner',
      recepientEmail: email,
    };
    await expectValid(EmailDTO, baseEmail);
    await expectValid(LikeEmailDTO, { ...baseEmail, mapPhotoUrl: 'https://example.com/map.jpg' });
    await expectValid(CommentLikeEmailDTO, { ...baseEmail, comment: 'Great!' });
    await expectValid(CommentEmailDTO, { ...baseEmail, comment: 'Great!', mapPhotoUrl: 'map' });
    await expectInvalid(EmailDTO, { ...baseEmail, recepientEmail: 'bad' });
    await expectInvalid(EmailDTO, { ...baseEmail, name: '' });
    await expectInvalid(LikeEmailDTO, { ...baseEmail, mapPhotoUrl: '' });
    await expectInvalid(CommentLikeEmailDTO, { ...baseEmail, comment: 1 });
    await expectInvalid(CommentEmailDTO, { ...baseEmail, mapPhotoUrl: '' });
  });

  it('validates UUID route params used by controllers', async () => {
    await expectValid(ParamsId, { id: uuid });
    await expectValid(UserIdParamsDto, { userId: uuid });
    await expectInvalid(ParamsId, { id: 'user-1' });
    await expectInvalid(ParamsId, {});
    await expectInvalid(UserIdParamsDto, { userId: 'user-1' });
    await expectInvalid(UserIdParamsDto, {});
  });
});
