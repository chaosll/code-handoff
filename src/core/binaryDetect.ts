export function isBinaryBuffer(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8000);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

export interface SectionPatch {
  label: string;
  patch: string;
}

export interface BinaryHit {
  section: string;
  file: string;
}

const BINARY_SECTION_RE = /^Binary files (.+?) and (.+?) differ$/gm;
const GIT_BINARY_PATCH_RE = /^GIT binary patch$/gm;

function cleanName(token: string): string | null {
  let name = token.trim();
  if (name === '/dev/null') return null;
  if (name.startsWith('a/') || name.startsWith('b/')) name = name.slice(2);
  return name.length > 0 ? name : null;
}

export function collectBinaryFiles(sections: SectionPatch[]): BinaryHit[] {
  const hits: BinaryHit[] = [];
  const seen = new Set<string>();
  for (const section of sections) {
    for (const m of section.patch.matchAll(BINARY_SECTION_RE)) {
      for (const token of [m[1], m[2]]) {
        const name = cleanName(token);
        if (name && !seen.has(name)) {
          seen.add(name);
          hits.push({ section: section.label, file: name });
        }
      }
    }
    if (GIT_BINARY_PATCH_RE.test(section.patch)) {
      hits.push({ section: section.label, file: '<GIT binary patch>' });
    }
  }
  return hits;
}