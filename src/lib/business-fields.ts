import { z } from 'zod';

// Plain business text is rendered escaped by React and written with SQL parameters.
// Reject invisible direction overrides/control characters, not legitimate scripts or punctuation.
const unsafeCode = /[\p{Cc}\p{Cf}]/u;
export const businessCodeSchema = z.string().trim().min(1,'Enter a code.').max(256,'Use at most 256 characters for a code.')
  .refine(value=>!unsafeCode.test(value),'Remove invisible control characters from the code.');
export const businessNameSchema = z.string().trim().min(1,'Enter a name.').max(512,'Use at most 512 characters for a name.')
  .refine(value=>!unsafeCode.test(value),'Remove invisible control characters from the name.');
export const businessDescriptionSchema = z.string().trim().max(50000,'Use at most 50,000 characters for instructions.');
export const staffUsernameSchema = z.string().trim().min(1).max(128)
  .refine(value=>!unsafeCode.test(value),'Remove invisible control characters from the internal username.').transform(value=>value.normalize('NFC'));
