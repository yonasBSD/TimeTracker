const memory = new Map();

function readLocal(key) {
  const value = localStorage.getItem(key);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export async function storeGet(key) {
  if (window.electronAPI?.storeGet) return window.electronAPI.storeGet(key);
  if (memory.has(key)) return memory.get(key);
  return readLocal(key);
}

export async function storeSet(key, value) {
  if (window.electronAPI?.storeSet) return window.electronAPI.storeSet(key, value);
  memory.set(key, value);
  localStorage.setItem(key, JSON.stringify(value));
  return undefined;
}

export async function storeDelete(key) {
  if (window.electronAPI?.storeDelete) return window.electronAPI.storeDelete(key);
  memory.delete(key);
  localStorage.removeItem(key);
  return undefined;
}

export async function storeClear() {
  if (window.electronAPI?.storeClear) return window.electronAPI.storeClear();
  memory.clear();
  localStorage.clear();
  return undefined;
}
