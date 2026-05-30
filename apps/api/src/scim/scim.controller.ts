import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UnauthorizedException,
} from '@nestjs/common';

import { Public } from '../rbac/decorators/public.decorator.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { ScimGroupsService } from './scim-groups.service.js';
import { ScimTokenService } from './scim-token.service.js';
import { ScimUsersService } from './scim-users.service.js';

/**
 * RFC 7644 SCIM v2 provider. Public + authenticated by a SCIM bearer token
 * (separate from JWTs / API keys). The token resolves the org; every handler
 * runs inside a synthesized tenant context.
 */
@Controller('scim/v2')
export class ScimController {
  constructor(
    private readonly tokens: ScimTokenService,
    private readonly users: ScimUsersService,
    private readonly groups: ScimGroupsService,
  ) {}

  @Public()
  @Get('ServiceProviderConfig')
  serviceProviderConfig(): Record<string, unknown> {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      patch: { supported: true },
      filter: { supported: true, maxResults: 200 },
      bulk: { supported: false },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [{ type: 'oauthbearertoken', name: 'OAuth Bearer Token' }],
    };
  }

  @Public()
  @Get('ResourceTypes')
  resourceTypes(): unknown[] {
    return [
      { schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: 'User', name: 'User', endpoint: '/Users', schema: 'urn:ietf:params:scim:schemas:core:2.0:User' },
      { schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: 'Group', name: 'Group', endpoint: '/Groups', schema: 'urn:ietf:params:scim:schemas:core:2.0:Group' },
    ];
  }

  // --- Users ---

  @Public()
  @Get('Users')
  listUsers(@Headers('authorization') auth: string | undefined, @Query('filter') filter?: string): Promise<unknown> {
    return this.run(auth, () => this.users.list(filter));
  }

  @Public()
  @Get('Users/:id')
  getUser(@Headers('authorization') auth: string | undefined, @Param('id') id: string): Promise<unknown> {
    return this.run(auth, () => this.users.getById(id));
  }

  @Public()
  @Post('Users')
  @HttpCode(HttpStatus.CREATED)
  createUser(@Headers('authorization') auth: string | undefined, @Body() body: Record<string, unknown>): Promise<unknown> {
    return this.run(auth, () => this.users.create(body));
  }

  @Public()
  @Patch('Users/:id')
  patchUser(@Headers('authorization') auth: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<unknown> {
    return this.run(auth, () => this.users.patch(id, body));
  }

  @Public()
  @Put('Users/:id')
  replaceUser(@Headers('authorization') auth: string | undefined, @Param('id') id: string, @Body() body: Record<string, unknown>): Promise<unknown> {
    return this.run(auth, () => this.users.replace(id, body));
  }

  @Public()
  @Delete('Users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUser(@Headers('authorization') auth: string | undefined, @Param('id') id: string): Promise<unknown> {
    return this.run(auth, () => this.users.archive(id));
  }

  // --- Groups ---

  @Public()
  @Get('Groups')
  listGroups(@Headers('authorization') auth: string | undefined, @Query('filter') filter?: string): Promise<unknown> {
    return this.run(auth, () => this.groups.list(filter));
  }

  @Public()
  @Get('Groups/:id')
  getGroup(@Headers('authorization') auth: string | undefined, @Param('id') id: string): Promise<unknown> {
    return this.run(auth, () => this.groups.getById(id));
  }

  @Public()
  @Patch('Groups/:id')
  patchGroup(@Headers('authorization') auth: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<unknown> {
    return this.run(auth, () => this.groups.patch(id, body));
  }

  /** Resolve the SCIM bearer token to an org and run within that context. */
  private async run<T>(auth: string | undefined, fn: () => Promise<T> | T): Promise<T> {
    const token = (auth ?? '').replace(/^Bearer\s+/i, '').trim();
    const organizationId = token ? await this.tokens.verifyAndResolve(token) : null;
    if (!organizationId) {
      throw new UnauthorizedException({ schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], detail: 'Invalid SCIM token', status: '401' });
    }
    return RequestContextStore.run(
      { userId: 'scim-provisioner', organizationId, roleId: null, principalType: 'api_key' },
      fn,
    ) as Promise<T>;
  }
}
