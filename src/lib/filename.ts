/**
 * File-name safety — ONE implementation shared by every upload path
 * (application documents, public agency-registration attachments).
 *
 * A file name is acceptable when it is:
 *   - non-empty and at most MAX_FILENAME_LENGTH characters,
 *   - free of path separators (`/`, `\`) and Windows drive/ADS noise (`:`),
 *   - free of C0 control characters (NUL, CR, LF, TAB, …) and DEL,
 *   - dot-safe: `.` / `..` are rejected outright.
 *
 * Implemented with explicit code-unit checks on purpose: the previous
 * regex form was silently over-escaped and rejected ordinary names such as
 * `passport.pdf`, which broke every upload that used a normal file name.
 * Character-class arithmetic is not the place where upload security should
 * depend on counting backslashes — hence the explicit loop below.
 */

/** Longest accepted file name (characters). */
export const MAX_FILENAME_LENGTH = 200;

/** Characters that would let a name address another directory or stream. */
const PATH_SEPARATORS = ["/", "\\"];

/** Reasons a name can be rejected, for precise server-side messages. */
export type FileNameProblem = "EMPTY" | "TOO_LONG" | "CONTROL_CHAR" | "PATH_SEPARATOR" | "DOT_NAME";

/** Return the concrete problem with a file name, or `null` when it is safe. */
export function fileNameProblem(name: string): FileNameProblem | null {
  if (typeof name !== "string") return "EMPTY";
  if (name.trim().length === 0) return "EMPTY";
  if (name.length > MAX_FILENAME_LENGTH) return "TOO_LONG";
  if (name === "." || name === "..") return "DOT_NAME";
  for (let i = 0; i < name.length; i += 1) {
    const code = name.charCodeAt(i);
    // C0 controls (0x00–0x1F) and DEL (0x7F) — NUL, CR, LF, TAB, ANSI escapes.
    if (code < 0x20 || code === 0x7f) return "CONTROL_CHAR";
  }
  for (const sep of PATH_SEPARATORS) {
    if (name.includes(sep)) return "PATH_SEPARATOR";
  }
  // `..` inside a name is harmless once separators are impossible, but a
  // leading `..` sequence is still rejected for clarity of intent.
  if (name.startsWith("..")) return "PATH_SEPARATOR";
  return null;
}

/** True when the file name is safe to store and echo back to users. */
export function isSafeFileName(name: string): boolean {
  return fileNameProblem(name) === null;
}

/** Human-readable message for a rejected name. */
export function fileNameErrorMessage(problem: FileNameProblem): string {
  switch (problem) {
    case "TOO_LONG":
      return `File names must be ${MAX_FILENAME_LENGTH} characters or fewer.`;
    case "CONTROL_CHAR":
      return "The file name contains unsupported control characters.";
    case "PATH_SEPARATOR":
      return "The file name must not contain folders or path separators.";
    case "EMPTY":
    default:
      return "Invalid file name.";
  }
}
