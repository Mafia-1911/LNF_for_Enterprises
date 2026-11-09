import { ROLES } from '@lf/domain';
import { z } from 'zod';

export const RoleSchema = z.enum(ROLES).meta({ id: 'Role' });

export const MeSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    role: RoleSchema,
    /** Shown under the name, e.g. "BSc Computer Science". */
    title: z.string().nullable(),
    /** Email for university accounts, phone number for visitors. */
    contact: z.string(),
  })
  .meta({ id: 'Me' });
export type Me = z.infer<typeof MeSchema>;

export const MeResponseSchema = z.object({ me: MeSchema }).meta({ id: 'MeResponse' });
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** Bangladesh mobile number in international form, e.g. +8801712345678. */
export const BdMobileSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .transform((v) => (v.startsWith('01') ? `+88${v}` : v.startsWith('8801') ? `+${v}` : v))
  .pipe(
    z.string().regex(/^\+8801[3-9]\d{8}$/, 'Enter a Bangladesh mobile number, e.g. 01712 345678.'),
  );

export const VisitorSignUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter your name as it appears on your ID.')
    .max(80, 'Use 80 characters or fewer.'),
  phoneNumber: BdMobileSchema,
});
export type VisitorSignUp = z.infer<typeof VisitorSignUpSchema>;

export const UniversityEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter your university email, e.g. name@northsouth.edu.'));

export const OtpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code.');
