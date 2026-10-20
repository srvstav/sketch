// Browser storage. Every access is guarded: private windows and blocked storage must not break the app.
const DECKS = 'sketch:decks:v1';
const KEY = 'sketch:key';
const SETTINGS = 'sketch:settings:v1';

const safe = (fn, fallback) => {
  try { return fn(); } catch { return fallback; }
};

export const loadDecks = () => safe(() => JSON.parse(localStorage.getItem(DECKS)) ?? [], []);

/** Newest first. Returns false if the browser refused (quota or blocked). */
export function saveDeck(deck) {
  const decks = [deck, ...loadDecks().filter((d) => d.id !== deck.id)];
  return safe(() => (localStorage.setItem(DECKS, JSON.stringify(decks)), true), false);
}

export function deleteDeck(id) {
  safe(() => localStorage.setItem(DECKS, JSON.stringify(loadDecks().filter((d) => d.id !== id))));
}

export const loadKey = () => safe(() => sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY) ?? '', '');

export function saveKey(key, remember) {
  safe(() => {
    sessionStorage.setItem(KEY, key);
    if (remember) localStorage.setItem(KEY, key);
    else localStorage.removeItem(KEY);
  });
}

export const keyRemembered = () => safe(() => Boolean(localStorage.getItem(KEY)), false);

export const loadSettings = () => safe(() => JSON.parse(localStorage.getItem(SETTINGS)) ?? {}, {});
export const saveSettings = (s) => safe(() => localStorage.setItem(SETTINGS, JSON.stringify(s)));
