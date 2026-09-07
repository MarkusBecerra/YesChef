import { z } from "zod";
import { USER_ROLES, type UserRole } from "@/server/db/schema";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password";

/** Total accounts the app will ever hold: the owner plus the people they invite. */
export const DEFAULT_MAX_ACCOUNTS = 6;

export function maxAccounts(): number {
  const raw = Number(process.env.MAX_ACCOUNTS?.trim());
  return Number.isInteger(raw) && raw > 0 && raw <= 100 ? raw : DEFAULT_MAX_ACCOUNTS;
}

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(200)
  .toLowerCase()
  .pipe(z.email("That doesn't look like an email address"));

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH);

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "What should we call you?").max(80),
  email: emailSchema,
  password: passwordSchema,
  inviteCode: z.string().trim().min(1, "An invite code is required").max(200),
});
export type SignUpInput = z.input<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(MAX_PASSWORD_LENGTH),
});
export type SignInInput = z.input<typeof signInSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(MAX_PASSWORD_LENGTH),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "What should we call you?").max(80).optional(),
  email: emailSchema.optional(),
});
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

export const createInviteSchema = z.object({
  label: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(80).nullable()).optional(),
});
export type CreateInviteInput = z.input<typeof createInviteSchema>;

export { USER_ROLES, type UserRole };

/** A user as the app hands it around: never the password hash. */
export type Account = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
};

export type InviteStatus = "open" | "used" | "revoked";

export type Invite = {
  id: number;
  code: string;
  label: string | null;
  status: InviteStatus;
  createdAt: string;
  usedAt: string | null;
  /** Name of whoever signed up with it, when it has been used. */
  usedByName: string | null;
};

export type Seats = { used: number; max: number; remaining: number };

/** A refusal the person on the form should read, optionally pinned to one field. */
export class AuthError extends Error {
  constructor(
    message: string,
    public status = 400,
    public field?: string,
  ) {
    super(message);
  }

  /** Field errors in the same shape `parseBody` produces, so forms render them identically. */
  get details(): { formErrors: string[]; fieldErrors: Record<string, string[]> } | undefined {
    return this.field ? { formErrors: [], fieldErrors: { [this.field]: [this.message] } } : undefined;
  }
}
