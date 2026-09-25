export const TILE_TYPES = [
  { name: '玉米', emoji: '🌽' }, { name: '胡萝卜', emoji: '🥕' },
  { name: '苹果', emoji: '🍎' }, { name: '草莓', emoji: '🍓' },
  { name: '蘑菇', emoji: '🍄' }, { name: '饲料桶', emoji: '🪣' },
  { name: '铃铛', emoji: '🔔' }, { name: '南瓜', emoji: '🎃' },
  { name: '雨靴', emoji: '🥾' },
];

const TILE_WIDTH = 46;
const TILE_HEIGHT = 48;
const GAME_VERSION = 1;

export function chinaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(input, random) {
  const result = [...input];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function layout(level) {
  const positions = [];
  if (level === 'tutorial') {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 6; col++) {
        positions.push({ x: 53 + col * 48, y: 111 + row * 50, layer: 0 });
      }
    }
    for (let col = 0; col < 6; col++) {
      positions.push({ x: 63 + col * 48, y: 136, layer: 1 });
    }
  } else {
    const offsets = [0, 10, 20, 10, 0];
    for (let layer = 0; layer < 5; layer++) {
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 5; col++) {
          positions.push({ x: 80 + col * 47 + offsets[layer], y: 48 + row * 50 + layer * 9, layer });
        }
      }
    }
    for (const x of [8, 336]) {
      for (let row = 0; row < 4; row++) {
        positions.push({ x, y: 73 + row * 55, layer: 5 });
      }
    }
  }
  return positions.map((position, id) => ({ id, ...position, type: -1, status: 'board' }));
}

function overlaps(a, b) {
  return a.x < b.x + TILE_WIDTH && a.x + TILE_WIDTH > b.x &&
    a.y < b.y + TILE_HEIGHT && a.y + TILE_HEIGHT > b.y;
}

export function isExposed(tiles, id) {
  const tile = tiles[id];
  return Boolean(tile && tile.status === 'board' && !tiles.some(other =>
    other.status === 'board' && other.layer > tile.layer && overlaps(tile, other)
  ));
}

function buildBoard(level, seed) {
  const typeCount = level === 'tutorial' ? 3 : TILE_TYPES.length;
  const copiesPerType = level === 'tutorial' ? 6 : 12;
  const random = randomGenerator(hashSeed(`${level}:${seed}`));
  for (let attempt = 0; attempt < 100; attempt++) {
    const tiles = layout(level);
    const quotas = Array(typeCount).fill(copiesPerType);
    const solution = [];
    let possible = true;
    while (tiles.some(tile => tile.status === 'board')) {
      const exposed = tiles.filter(tile => isExposed(tiles, tile.id)).map(tile => tile.id);
      if (exposed.length < 3) { possible = false; break; }
      const triple = shuffled(exposed, random).slice(0, 3);
      const remainingTypes = quotas.map((count, type) => count >= 3 ? type : -1).filter(type => type >= 0);
      const type = remainingTypes[Math.floor(random() * remainingTypes.length)];
      quotas[type] -= 3;
      for (const id of triple) { tiles[id].type = type; tiles[id].status = 'gone'; }
      solution.push(...triple);
    }
    if (!possible) continue;
    for (const tile of tiles) tile.status = 'board';
    if (verifySolution(tiles, solution)) return { tiles, solution };
  }
  throw new Error('无法生成可解牌局');
}

export function verifySolution(tiles, solution) {
  const copy = structuredClone(tiles);
  if (solution.length !== copy.length) return false;
  for (let i = 0; i < solution.length; i += 3) {
    const group = solution.slice(i, i + 3);
    if (group.length !== 3 || new Set(group).size !== 3) return false;
    if (!group.every(id => isExposed(copy, id))) return false;
    if (!group.every(id => copy[id].type === copy[group[0]].type)) return false;
    for (const id of group) copy[id].status = 'gone';
  }
  return copy.every(tile => tile.status === 'gone');
}

export function createGame(level = 'tutorial', date = chinaDate()) {
  if (!['tutorial', 'daily'].includes(level)) throw new Error('未知关卡');
  const seed = level === 'tutorial' ? 'first-piggy-lesson' : date;
  const { tiles, solution } = buildBoard(level, seed);
  return {
    version: GAME_VERSION, level, date: level === 'daily' ? date : null, seed,
    tiles, solution, tray: [], aside: [],
    tools: { undo: false, move: false, shuffle: false }, reviveUsed: false,
    shuffleNonce: 0, moves: 0, status: 'playing', lastMove: null,
  };
}

function snapshot(state) {
  return structuredClone({ ...state, lastMove: null });
}

function settledStatus(state) {
  if (state.tiles.every(tile => tile.status === 'gone')) return 'won';
  if (state.tray.length >= 7) return 'lost';
  return 'playing';
}

export function applyAction(state, action) {
  if (!state || !action) return { state, events: [] };
  const events = [];
  if (action.type === 'select') {
    if (state.status !== 'playing') return { state, events };
    const tile = state.tiles[action.id];
    const fromBoard = tile?.status === 'board';
    const fromAside = tile?.status === 'aside';
    if (!tile || (fromBoard && !isExposed(state.tiles, tile.id)) || (!fromBoard && !fromAside)) return { state, events };
    const next = structuredClone(state);
    next.lastMove = snapshot(state);
    if (fromAside) next.aside = next.aside.filter(id => id !== tile.id);
    next.tiles[tile.id].status = 'tray';
    next.tray.push(tile.id);
    next.moves++;
    events.push({ type: 'select', id: tile.id, source: fromAside ? 'aside' : 'board' });
    const same = next.tray.filter(id => next.tiles[id].type === tile.type);
    if (same.length === 3) {
      const matched = new Set(same);
      for (const id of same) next.tiles[id].status = 'gone';
      next.tray = next.tray.filter(id => !matched.has(id));
      events.push({ type: 'match', ids: same });
    }
    next.status = settledStatus(next);
    if (next.status !== 'playing') events.push({ type: next.status });
    return { state: next, events };
  }
  if (action.type === 'undo') {
    if (state.status === 'won' || state.tools.undo || !state.lastMove) return { state, events };
    const next = structuredClone(state.lastMove);
    next.tools.undo = true;
    next.lastMove = null;
    events.push({ type: 'undo' });
    return { state: next, events };
  }
  if (action.type === 'move') {
    if (state.status !== 'playing' || state.tools.move || state.tray.length < 3) return { state, events };
    const next = structuredClone(state);
    const moved = next.tray.splice(0, 3);
    next.aside.push(...moved);
    for (const id of moved) next.tiles[id].status = 'aside';
    next.tools.move = true;
    next.lastMove = null;
    events.push({ type: 'move', ids: moved });
    return { state: next, events };
  }
  if (action.type === 'shuffle') {
    if (state.status !== 'playing' || state.tools.shuffle) return { state, events };
    const ids = state.tiles.filter(tile => tile.status === 'board').map(tile => tile.id);
    if (new Set(ids.map(id => state.tiles[id].type)).size < 2) return { state, events };
    const next = structuredClone(state);
    const before = ids.map(id => next.tiles[id].type);
    const random = randomGenerator(hashSeed(`${state.seed}:shuffle:${state.shuffleNonce}:${state.moves}`));
    let after = before;
    for (let attempt = 0; attempt < 8; attempt++) {
      after = shuffled(before, random);
      if (after.some((type, index) => type !== before[index])) break;
    }
    if (after.every((type, index) => type === before[index])) return { state, events };
    ids.forEach((id, index) => { next.tiles[id].type = after[index]; });
    next.tools.shuffle = true;
    next.shuffleNonce++;
    next.lastMove = null;
    events.push({ type: 'shuffle' });
    return { state: next, events };
  }
  if (action.type === 'revive') {
    if (state.status !== 'lost' || state.reviveUsed || state.tray.length < 3) return { state, events };
    const next = structuredClone(state);
    const moved = next.tray.splice(0, 3);
    next.aside.push(...moved);
    for (const id of moved) next.tiles[id].status = 'aside';
    next.reviveUsed = true;
    next.status = 'playing';
    next.lastMove = null;
    events.push({ type: 'revive', ids: moved });
    return { state: next, events };
  }
  return { state, events };
}

export function isValidGame(state) {
  if (!state || state.version !== GAME_VERSION || !['tutorial', 'daily'].includes(state.level)) return false;
  const expected = state.level === 'tutorial' ? 18 : 108;
  if (!Array.isArray(state.tiles) || state.tiles.length !== expected || !Array.isArray(state.tray) || !Array.isArray(state.aside)) return false;
  if (!state.tiles.every((tile, id) => tile.id === id && Number.isInteger(tile.type) && tile.type >= 0 && tile.type < TILE_TYPES.length && ['board', 'tray', 'aside', 'gone'].includes(tile.status))) return false;
  if (state.tray.length > 7 || new Set([...state.tray, ...state.aside]).size !== state.tray.length + state.aside.length) return false;
  if (!state.tray.every(id => state.tiles[id]?.status === 'tray') || !state.aside.every(id => state.tiles[id]?.status === 'aside')) return false;
  if (!state.tools || typeof state.tools.undo !== 'boolean' || typeof state.tools.move !== 'boolean' || typeof state.tools.shuffle !== 'boolean') return false;
  return ['playing', 'won', 'lost'].includes(state.status);
}
