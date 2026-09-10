function cleanPrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, '');
}

function assertRelativePath(relativePath: string): void {
  if (!relativePath || relativePath.startsWith('/') || relativePath.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('Backblaze object has an unsafe relative path.');
  }
}

/** Build a B2 object key without altering any filename character. */
export function b2ObjectName(prefix: string, relativePath: string): string {
  assertRelativePath(relativePath);
  const root = cleanPrefix(prefix);
  return root ? `${root}/${relativePath}` : relativePath;
}

/** A trailing slash prevents `raw/JOB1` from also matching `raw/JOB10`. */
export function b2ListingPrefix(prefix: string): string {
  const root = cleanPrefix(prefix);
  return root ? `${root}/` : '';
}

/** Recreate the exact manifest-relative path from a listed B2 object key. */
export function b2RelativeName(prefix: string, objectName: string): string {
  const listingPrefix = b2ListingPrefix(prefix);
  if (listingPrefix && !objectName.startsWith(listingPrefix)) {
    throw new Error('Backblaze returned a file outside this project package.');
  }
  const relativePath = listingPrefix ? objectName.slice(listingPrefix.length) : objectName;
  assertRelativePath(relativePath);
  return relativePath;
}
