import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from 'src/auth/request/auth-request';
import { getAuthenticatedUserId } from 'src/auth/request/auth-request';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ParamsId } from 'src/common/dto/params-validation';
import { RATE_LIMITS, RateLimit } from 'src/common/security/rate-limits';
import { validateOptionalIntegerQuery } from 'src/common/utils/query-validation';
import { ADMIN_ROLES } from './admin-access.constants';
import { AdminAccessService } from './admin-access.service';
import type { AdminRole } from './admin-access.types';
import { AdminRolesGuard } from './admin-roles.guard';

@ApiTags('admin')
@ApiBearerAuth('bearerAuth')
@Controller('admin')
export class AdminController {
  constructor(@Inject(AdminAccessService) private readonly adminAccess: AdminAccessService) {}

  @Get('access')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get the current user’s admin permissions' })
  @ApiOkResponse({ description: 'Current admin roles and permissions' })
  async getAccess(@Req() request: AuthenticatedRequest) {
    return await this.adminAccess.getAccess(getAuthenticatedUserId(request));
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, AdminRolesGuard)
  @ApiOperation({ summary: 'List current admin users or find users by part of an email address' })
  @ApiOkResponse({ description: 'Users and their active admin roles' })
  async listUsers(@Query('email') email?: string, @Query('take') take?: string) {
    const pageSize = Number(validateOptionalIntegerQuery(take, 'take', { min: 1, max: 100 }) ?? 50);
    const normalizedEmail = email?.trim().toLowerCase();
    if (normalizedEmail && normalizedEmail.length > 255) throw new BadRequestException('Некорректный email');
    return await this.adminAccess.listUsers(normalizedEmail, pageSize);
  }

  @Get('access-audit')
  @UseGuards(JwtAuthGuard, AdminRolesGuard)
  @ApiOperation({ summary: 'Get admin access change history' })
  @ApiOkResponse({ description: 'Recent admin access changes' })
  async listAudit(@Query('take') take?: string) {
    return await this.adminAccess.listAudit(
      Number(validateOptionalIntegerQuery(take, 'take', { min: 1, max: 100 }) ?? 50),
    );
  }

  @Put('users/:id/roles/:role')
  @UseGuards(JwtAuthGuard, AdminRolesGuard)
  @RateLimit(RATE_LIMITS.adminAccess.limit, RATE_LIMITS.adminAccess.ttl)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Grant an admin role to a user' })
  @ApiNoContentResponse({ description: 'Admin role granted' })
  async grantRole(@Param() { id }: ParamsId, @Param('role') roleName: string, @Req() request: AuthenticatedRequest) {
    await this.adminAccess.grantRole(getAuthenticatedUserId(request), id, this.parseRole(roleName));
  }

  @Delete('users/:id/roles/:role')
  @UseGuards(JwtAuthGuard, AdminRolesGuard)
  @RateLimit(RATE_LIMITS.adminAccess.limit, RATE_LIMITS.adminAccess.ttl)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an admin role from a user' })
  @ApiNoContentResponse({ description: 'Admin role revoked' })
  async revokeRole(@Param() { id }: ParamsId, @Param('role') roleName: string, @Req() request: AuthenticatedRequest) {
    await this.adminAccess.revokeRole(getAuthenticatedUserId(request), id, this.parseRole(roleName));
  }

  private parseRole(role: string): AdminRole {
    if (!ADMIN_ROLES.includes(role as AdminRole)) throw new BadRequestException('Неизвестная роль админки');
    return role as AdminRole;
  }
}
