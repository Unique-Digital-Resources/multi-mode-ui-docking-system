/**
 * App Engine — Metadata
 * ======================
 * `Version` (semantic) + `PayloadSchema` (type description).
 */

export interface Version { major: number; minor: number; patch: number }

export function version(major: number, minor: number, patch: number): Version {
  return { major, minor, patch };
}

export function isCompatible(a: Version, b: Version): boolean {
  return a.major === b.major;
}

export function versionToString(v: Version): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/** Simple payload schema describing a command/task input or output type. */
export interface PayloadSchema {
  typeName: string;
  description?: string;
}

export function payloadSchemaOf<T>(typeName: string, description?: string): PayloadSchema {
  return { typeName, description };
}
