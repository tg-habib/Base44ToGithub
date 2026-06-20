export function lsGet<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T;
  } catch {
    return null;
  }
}

export function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* noop */ }
}

export function ssGet<T>(key: string): T | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null") as T;
  } catch {
    return null;
  }
}

export function ssSet(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch { /* noop */ }
}

export function ssDel(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch { /* noop */ }
}
