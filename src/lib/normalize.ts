/**
 * Normaliza um nome de carta para busca: minúsculas, sem acento e sem
 * pontuação. Precisa dar o mesmo resultado que `norm()` do pipeline em Python.
 */
export function normalizeName(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
