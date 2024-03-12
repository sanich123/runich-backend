import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { AccountService } from './account.service';
import { ParamsId } from 'src/app/params-validation';
import { ApiResponse, ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { PATHS } from 'src/utils/const';
import { ProfileDto } from './account.dto';
import { blurhashFromURL } from 'blurhash-from-url';

@ApiTags(PATHS.profile)
@Controller(PATHS.profile)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  @ApiOperation({ summary: 'Gets all profiles' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getAllAccounts() {
    return await this.accountService.getAllAccounts();
  }

  @Patch(PATHS.id)
  @HttpCode(HttpStatus.CREATED)
  async updateProfileInfo(@Body() profile: ProfileDto, @Param() { id }: ParamsId) {
    return await this.accountService.updateProfileInfo(profile, id);
  }

  @Get(PATHS.id)
  @ApiOperation({ summary: 'Get user profile by id' })
  @ApiParam({ name: 'userId', required: true, description: 'User identifer' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Success' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request' })
  async getAccountByUserId(@Param() { id }: ParamsId) {
    return await this.accountService.getAccountByUserId(id);
  }

  @Post('blurhash')
  async getBlurhashOfUrlString(
    @Body() { photoVideoUrls }: { photoVideoUrls: { url: string; thumbnail: string | null; blurhash?: string }[] },
  ) {
    return await Promise.all(
      photoVideoUrls.map(async (photoVideoUrl) => {
        const blurhash = await blurhashFromURL(photoVideoUrl.thumbnail ? photoVideoUrl.thumbnail : photoVideoUrl.url);
        photoVideoUrl.blurhash = blurhash.encoded;
        return photoVideoUrl;
      }),
    );
  }
}
