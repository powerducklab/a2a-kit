// Minimal USTAR (POSIX 1003.1) tar writer. No runtime Node code is required, so
// the archive can be produced entirely in the browser.

const encoder = new TextEncoder();
const BLOCK = 512;

function octal(value: number, length: number): string {
  return value.toString(8).padStart(length - 1, "0") + "\0";
}

export function tarFiles(files: Record<string, string>): Uint8Array {
  const chunks: Uint8Array[] = [];

  for (const [name, content] of Object.entries(files)) {
    const bytes = encoder.encode(content);
    const header = new Uint8Array(BLOCK);
    const put = (offset: number, value: string): void => header.set(encoder.encode(value), offset);

    put(0, name);
    put(100, "0000644\0"); // mode: regular file, rw-r--r--
    put(108, "0000000\0"); // uid
    put(116, "0000000\0"); // gid
    put(124, octal(bytes.length, 12)); // size
    put(136, "00000000000\0"); // mtime
    put(148, "        "); // checksum placeholder (spaces)
    put(156, "0"); // type flag: regular file
    put(257, "ustar\0"); // magic
    put(263, "00"); // version

    let checksum = 0;
    for (const byte of header) checksum += byte;
    put(148, checksum.toString(8).padStart(6, "0") + "\0 ");

    const padding = new Uint8Array((BLOCK - (bytes.length % BLOCK)) % BLOCK);
    chunks.push(header, bytes, padding);
  }

  // Two zero blocks mark the end of the archive.
  chunks.push(new Uint8Array(BLOCK * 2));

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
