import { API_BASE, authFetch, type ApiRequestBody, type ApiResponse } from "./client";

/** 账号列表（仅管理员）。返回含注册人数与每个账号的 token 用量。 */
export async function listUsers(): Promise<ApiResponse<"/api/users", "get">> {
  const res = await authFetch(`${API_BASE}/users`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** 停用/启用账号，或重置其密码。两个字段都可选，只传要改的那个。 */
export async function updateUser(
  userId: string,
  patch: ApiRequestBody<"/api/users/{user_id}", "patch">
): Promise<ApiResponse<"/api/users/{user_id}", "patch">> {
  const res = await authFetch(`${API_BASE}/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** 删除账号。会级联清掉该用户的历史、简历、画像与本地文件，不可撤销。 */
export async function deleteUser(
  userId: string
): Promise<ApiResponse<"/api/users/{user_id}", "delete">> {
  const res = await authFetch(`${API_BASE}/users/${userId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
