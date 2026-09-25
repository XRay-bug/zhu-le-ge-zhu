import { TILE_TYPES, isValidGame } from './engine.mjs';

const unchanged = state => ({ state, events: [] });

// The shortcut is deliberately exact so a normal modifier combination cannot open the panel.
export function isAuthorShortcut(event) {
  return Boolean(event && event.code === 'KeyP' && event.ctrlKey && event.altKey &&
    event.shiftKey && !event.metaKey && !event.repeat);
}

function snapshot(state) {
  return structuredClone({ ...state, lastMove: null });
}

function outcome(state) {
  return state.tiles.every(tile => tile.status === 'gone') ? 'won' : 'playing';
}

export function applyAuthorAction(state, type) {
  if (!isValidGame(state)) return unchanged(state);

  if (type === 'quick-win') {
    if (state.status === 'won') return unchanged(state);
    const next = structuredClone(state);
    for (const tile of next.tiles) tile.status = 'gone';
    next.tray = [];
    next.aside = [];
    next.lastMove = null;
    next.status = 'won';
    return { state: next, events: [{ type: 'author', action: type }, { type: 'won' }] };
  }

  if (type === 'clear-tray') {
    if (state.status === 'won' || state.tray.length === 0) return unchanged(state);
    const next = structuredClone(state);
    const ids = [...next.tray];
    for (const id of ids) next.tiles[id].status = 'gone';
    next.tray = [];
    next.lastMove = null;
    next.status = outcome(next);
    const events = [{ type: 'author', action: type, ids }];
    if (next.status === 'won') events.push({ type: 'won' });
    return { state: next, events };
  }

  if (type === 'reset-tools') {
    if (state.status === 'won' || (!Object.values(state.tools).some(Boolean) && !state.reviveUsed)) {
      return unchanged(state);
    }
    const next = structuredClone(state);
    next.tools.undo = false;
    next.tools.move = false;
    next.tools.shuffle = false;
    next.reviveUsed = false;
    return { state: next, events: [{ type: 'author', action: type }] };
  }

  if (type === 'simulate-loss') {
    if (state.status !== 'playing') return unchanged(state);
    const next = structuredClone(state);
    next.lastMove = snapshot(state);
    next.tools.undo = false;
    next.reviveUsed = false;

    // Prefer live cards. Near the end of a game, restore removed cards if needed.
    const donors = ['board', 'aside', 'gone'].flatMap(status =>
      next.tiles.filter(tile => tile.status === status));
    const added = [];
    const counts = Array(TILE_TYPES.length).fill(0);
    for (const id of next.tray) counts[next.tiles[id].type]++;
    while (next.tray.length < 7) {
      const tile = donors.shift();
      if (!tile) return unchanged(state);
      if (counts[tile.type] >= 2) tile.type = counts.findIndex(count => count < 2);
      counts[tile.type]++;
      if (tile.status === 'aside') next.aside = next.aside.filter(id => id !== tile.id);
      tile.status = 'tray';
      next.tray.push(tile.id);
      added.push(tile.id);
    }
    next.status = 'lost';
    return { state: next, events: [{ type: 'author', action: type, ids: added }, { type: 'lost' }] };
  }

  return unchanged(state);
}
