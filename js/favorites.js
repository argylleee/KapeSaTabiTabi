const STORAGE_KEY = "kst_favorites";

function readSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function writeSet(set) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export function isFavorite(placeId) {
  if (!placeId) return false;
  return readSet().has(placeId);
}

export function toggleFavorite(placeId) {
  const set = readSet();
  if (set.has(placeId)) {
    set.delete(placeId);
  } else {
    set.add(placeId);
  }
  writeSet(set);
  return set.has(placeId);
}
