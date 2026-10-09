import { randomUUID } from "node:crypto";
import { z } from "zod";
import { USER_ROLES } from "./roles.js";

export const userRoleSchema = z.enum(USER_ROLES);
export const userStatusSchema = z.enum(["ACTIVE", "REVOKED"]);

export const userRecordSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  roles: z.array(userRoleSchema).min(1),
  passwordHash: z.string().min(1),
  createdTs: z.number().int(),
  status: userStatusSchema,
  /** Who created this user, when an authenticated principal did (P1-56). Absent or null means self-provisioned. */
  createdBy: z.object({ principalKey: z.string().min(1), admission: z.enum(["browser_csrf", "native_login_token"]) }).strict().nullable().optional()
});

export const usersFileSchema = z.object({
  v: z.literal(1),
  updatedTs: z.number().int(),
  users: z.array(userRecordSchema)
});

export type UserStatus = z.infer<typeof userStatusSchema>;
export type UserRecord = z.infer<typeof userRecordSchema>;
export type UsersFile = z.infer<typeof usersFileSchema>;

export function createUserRecord(input: {
  username: string;
  roles: Array<z.infer<typeof userRoleSchema>>;
  passwordHash: string;
}): UserRecord {
  return userRecordSchema.parse({
    userId: randomUUID(),
    username: input.username.trim(),
    roles: input.roles,
    passwordHash: input.passwordHash,
    createdTs: Date.now(),
    status: "ACTIVE"
  });
}
