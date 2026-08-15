const encoder = new TextEncoder();
const ITERATIONS = 310_000;

export async function emailLookupHash(email: string): Promise<string> {
  const normalized = email.trim().toLocaleLowerCase('pt-BR');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(normalized)));
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function passwordVerifier(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: salt as BufferSource }, key, 256);
}

export function verifierMatches(left: ArrayBuffer, right: ArrayBuffer): boolean {
  const first = new Uint8Array(left); const second = new Uint8Array(right);
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) difference |= first[index]! ^ second[index]!;
  return difference === 0;
}
