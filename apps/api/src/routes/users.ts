import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'
import {
  DeleteManagedUserResponseSchema,
  ManagedUserListSchema,
  UpdateManagedUserResponseSchema,
  UpdateManagedUserSchema,
} from '@techspar/contracts'
import type { TokenService, UserAdminUseCases } from '@techspar/core'
import { authenticatedContext } from '../http/context.ts'

const UserIdParamSchema = z.object({ user_id: z.string().min(1) })

/**
 * 账号管理，全部仅限管理员。
 *
 * 权限判断刻意留在 core 的 UserAdminService 里做（与 DataMigrationService 同一范式），
 * 路由层只负责取上下文和映射传输格式——这样 App 装配依赖时也换不掉这道守卫。
 */
export function registerUserRoutes(app: OpenAPIHono, deps: { users: UserAdminUseCases; tokens: TokenService }): void {
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/users',
      responses: { 200: { content: { 'application/json': { schema: ManagedUserListSchema } }, description: 'All accounts (administrators only)' } },
    }),
    async (c) => c.json(await deps.users.list(await authenticatedContext(c, deps.tokens))),
  )

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/api/users/{user_id}',
      request: {
        params: UserIdParamSchema,
        body: { content: { 'application/json': { schema: UpdateManagedUserSchema } } },
      },
      responses: { 200: { content: { 'application/json': { schema: UpdateManagedUserResponseSchema } }, description: 'Updated account' } },
    }),
    async (c) => {
      const context = await authenticatedContext(c, deps.tokens)
      return c.json(await deps.users.update(context, c.req.valid('param').user_id, c.req.valid('json')))
    },
  )

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/api/users/{user_id}',
      request: { params: UserIdParamSchema },
      responses: { 200: { content: { 'application/json': { schema: DeleteManagedUserResponseSchema } }, description: 'Deleted account' } },
    }),
    async (c) => {
      const context = await authenticatedContext(c, deps.tokens)
      return c.json(await deps.users.remove(context, c.req.valid('param').user_id))
    },
  )
}
