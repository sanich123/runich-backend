import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  LoginCodeDto,
  ChangePasswordDto,
  ConfirmationCodeDto,
  EmailLoginLinkDto,
  GetEmailCodeForPasswordDto,
  PasswordChangeCodeDto,
  RefreshTokenDto,
  RegisterUserDto,
} from '../../auth/dto/auth.dto';
import { UserIdParamsDto } from '../../auth/dto/auth.dto';
import { ActivityDto, ActivityMediaAppendDto } from '../../activity/activity.dto';
import { CommentDTO, CommentLikeDto, CommentUpdateDto } from '../../comment/comment.dto';
import { FriendDto } from '../../friend/friend.dto';
import { LikeDto } from '../../like/like.dto';
import { ParamsId } from '../../common/dto/params-validation';
import { UserDto } from '../../user/user.dto';
import { MAX_ACTIVITY_LOCATIONS } from '../../common/constants';

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

    for (const dto of [LoginCodeDto, RefreshTokenDto]) {
      await expectValid(dto, { [dto === LoginCodeDto ? 'code' : 'refreshToken']: 'token' });
      await expectInvalid(dto, {});
      await expectInvalid(dto, { [dto === LoginCodeDto ? 'code' : 'refreshToken']: '' });
      await expectInvalid(dto, { [dto === LoginCodeDto ? 'code' : 'refreshToken']: 42 });
    }
    await expectInvalid(LoginCodeDto, { accessToken: 'legacy-token' });

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
      height: '180',
      age: '30',
      emailNotifications: false,
      pushNotifications: false,
      inAppNotifications: false,
      email,
      language: 'en',
    });
    await expectValid(UserDto, { name: null, birthday: null, email: null, emailNotifications: null });
    await expectInvalid(UserDto, { birthday: '02.01.1990' });
    await expectInvalid(UserDto, { email: 'bad' });
    await expectInvalid(UserDto, { emailNotifications: 'false' });
    await expectInvalid(UserDto, { pushNotifications: 'false' });
    await expectInvalid(UserDto, { inAppNotifications: 'false' });
    await expectInvalid(UserDto, { weight: 65 });
    await expectInvalid(UserDto, { weight: '201' });
    await expectInvalid(UserDto, { height: '231' });
    await expectInvalid(UserDto, { age: '101' });
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
      steps: 1240,
      sport: 'run',
      date: '2026-08-12T10:00:00.000Z',
      timeZone: 'Europe/Moscow',
      description: 'Morning run',
      emotion: 'happy',
      visibility: 'public',
      media: [{ url: 'https://example.com/photo.jpg', thumbnail: null, blurhash: 'hash' }],
      mapPhotoUrl: 'https://example.com/map.jpg',
      mapPhotoUrlBlurhash: 'hash',
      title: 'Morning',
      locations: [{ coords: { latitude: 55.75, longitude: 37.61, speed: 3, mocked: false } }],
      kilometresSplit: [
        {
          lastKilometerDuration: 300,
          lastKilometerAltitude: 10,
          lastKilometerSteps: 240,
          kilometerPoint: { coords: { latitude: 55.75, longitude: 37.61 } },
        },
      ],
    });
    const activityMedia = Array.from({ length: 5 }, (_, index) => ({
      url: `https://example.com/photo-${index}.jpg`,
      thumbnail: null,
      blurhash: 'hash',
    }));
    const activityFields = { duration: 100, distance: 1000, speed: 10, sport: 'run' };
    await expectValid(ActivityDto, { ...activityFields, media: activityMedia });
    await expectInvalid(ActivityDto, { ...activityFields, media: [...activityMedia, ...activityMedia.slice(0, 1)] });
    await expectValid(ActivityMediaAppendDto, { media: activityMedia });
    await expectInvalid(ActivityMediaAppendDto, { media: [...activityMedia, ...activityMedia.slice(0, 1)] });
    await expectInvalid(ActivityDto, {});
    await expectInvalid(ActivityDto, { duration: 1.5, distance: 1, speed: 1, sport: 'run' });
    await expectInvalid(ActivityDto, { duration: 1, distance: 1, speed: 1, sport: 'walk', steps: -1 });
    await expectInvalid(ActivityDto, { duration: 1, distance: 1, speed: 1, sport: 'run', date: 'yesterday' });
    await expectInvalid(ActivityDto, {
      duration: 1,
      distance: 1,
      speed: 1,
      sport: 'run',
      timeZone: 'Mars/Olympus',
    });
    await expectInvalid(ActivityDto, { duration: 1, distance: 1, speed: 1, sport: 'run', visibility: 'invalid' });
    await expectInvalid(ActivityDto, {
      duration: 1,
      distance: 1,
      speed: 1,
      sport: 'run',
      media: [{ url: 42 }],
    });
    await expectValid(ActivityDto, {
      duration: 1,
      distance: 1,
      speed: 1,
      sport: 'run',
      media: [{ url: 'photo' }],
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
    await expectInvalid(ActivityDto, {
      duration: 1,
      distance: 1,
      speed: 1,
      sport: 'run',
      locations: Array.from({ length: MAX_ACTIVITY_LOCATIONS + 1 }, () => ({
        coords: { latitude: 55.75, longitude: 37.61 },
      })),
    });
  });

  it('validates social, comment and email DTOs', async () => {
    await expectValid(CommentDTO, { comment: 'Nice activity' });
    await expectValid(CommentUpdateDto, { comment: 'Updated comment' });
    await expectValid(CommentLikeDto, { commentId: uuid });
    await expectValid(FriendDto, {});
    await expectValid(LikeDto, { activityId: uuid });

    for (const dto of [CommentDTO, CommentUpdateDto]) {
      await expectInvalid(dto, { comment: '' });
      await expectInvalid(dto, { comment: 42 });
    }
    await expectInvalid(CommentLikeDto, {});
    await expectValid(FriendDto, { unexpected: 'ignored' });
    await expectValid(LikeDto, { activityId: uuid });
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
