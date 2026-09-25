import { TILE_TYPES, applyAction, chinaDate, createGame, isExposed, isValidGame } from './engine.mjs';
import { playSound, setSoundEnabled, unlockAudio } from './audio.mjs';

const $ = selector => document.querySelector(selector);
const board = $('#board');
const tray = $('#tray');
const aside = $('#aside');
const asideWrap = $('#aside-wrap');
const statusLine = $('#status-line');
const backdrop = $('#dialog-backdrop');
const dialogTitle = $('#dialog-title');
const dialogMessage = $('#dialog-message');
const dialogArt = $('#dialog-art');
const dialogActions = $('#dialog-actions');
const soundButton = $('#sound-button');
const storageGame = 'piggy-puzzle-run-v1';
const storageMeta = 'piggy-puzzle-meta-v1';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be unavailable */ }
}

const storedMeta = readJson(storageMeta);
const meta = {
  tutorialCleared: Boolean(storedMeta?.tutorialCleared),
  dailyWins: Array.isArray(storedMeta?.dailyWins) ? storedMeta.dailyWins.filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).slice(-365) : [],
  soundOn: storedMeta?.soundOn !== false,
};
let game = readJson(storageGame);
if (!isValidGame(game)) game = createGame(meta.tutorialCleared ? 'daily' : 'tutorial');
if (game.lastMove && !isValidGame(game.lastMove)) game.lastMove = null;
if (game.level === 'daily' && game.date !== chinaDate() && game.status !== 'playing') game = createGame('daily');
let busy = false;
let lastFocus = null;
setSoundEnabled(meta.soundOn);

const mascot = $('#mascot-image');
mascot.src = './assets/pig-mascot.png';
mascot.onload = () => { mascot.hidden = false; $('.mascot-fallback').hidden = true; };
const atlas = new Image();
atlas.onload = () => document.body.classList.add('has-atlas');
atlas.src = './assets/icons-atlas.png';

function icon(type) {
  const item = TILE_TYPES[type];
  const span = document.createElement('span');
  span.className = 'tile-icon';
  span.style.backgroundPosition = `${type % 3 * 50}% ${Math.floor(type / 3) * 50}%`;
  span.textContent = item.emoji;
  span.setAttribute('aria-hidden', 'true');
  return span;
}

function save() {
  writeJson(storageGame, game);
  writeJson(storageMeta, meta);
}

function say(message) { statusLine.textContent = message; }

function makeBoardTile(tile, animateId) {
  const button = document.createElement('button');
  const exposed = isExposed(game.tiles, tile.id);
  button.type = 'button';
  button.dataset.tileId = String(tile.id);
  button.className = `tile${exposed ? '' : ' is-covered'}${animateId === tile.id ? ' is-entering' : ''}`;
  button.style.left = `${tile.x / 390 * 100}%`;
  button.style.top = `${tile.y / 370 * 100}%`;
  button.style.zIndex = String(tile.layer * 100 + tile.id);
  button.disabled = !exposed || game.status !== 'playing' || busy;
  button.setAttribute('aria-label', `${TILE_TYPES[tile.type].name}${button.disabled ? '，被遮挡或不可选' : '，点击放入收纳槽'}`);
  button.append(icon(tile.type));
  button.addEventListener('click', () => selectTile(tile.id, button));
  return button;
}

function render(animateId = -1) {
  const tutorial = game.level === 'tutorial';
  $('#level-kicker').textContent = tutorial ? '第 1 关 · 新手猪圈' : '第 2 关 · 今日挑战';
  $('#level-title').textContent = tutorial ? '凑齐三张，清空猪圈！' : '今日猪圈大挑战';
  $('#level-tip').textContent = tutorial ? '点选亮起的卡牌，放进下方的 7 格槽。' : '留意底层图案，别让收纳槽装满。';
  $('#day-label').textContent = tutorial ? '教学关' : game.date;
  $('#remaining-label').textContent = `未消除 ${game.tiles.filter(tile => tile.status !== 'gone').length} 张`;
  $('#tray-count').textContent = `${game.tray.length} / 7`;

  board.replaceChildren(...game.tiles.filter(tile => tile.status === 'board').map(tile => makeBoardTile(tile, animateId)));
  const slots = [];
  for (let i = 0; i < 7; i++) {
    const slot = document.createElement('div');
    slot.className = 'tray-slot';
    if (game.tray[i] !== undefined) {
      const tile = game.tiles[game.tray[i]];
      const card = document.createElement('div');
      card.className = 'tray-card';
      card.setAttribute('aria-label', TILE_TYPES[tile.type].name);
      card.append(icon(tile.type));
      slot.append(card);
    }
    slots.push(slot);
  }
  tray.replaceChildren(...slots);
  asideWrap.hidden = game.aside.length === 0;
  aside.replaceChildren(...game.aside.map(id => {
    const tile = game.tiles[id];
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.tileId = String(tile.id);
    button.className = 'aside-card';
    button.disabled = game.status !== 'playing' || busy;
    button.setAttribute('aria-label', `取回${TILE_TYPES[tile.type].name}`);
    button.append(icon(tile.type));
    button.addEventListener('click', () => selectTile(id, button));
    return button;
  }));

  const tools = [
    ['undo', 'tool-undo', Boolean(game.lastMove)],
    ['move', 'tool-move', game.tray.length >= 3],
    ['shuffle', 'tool-shuffle', new Set(game.tiles.filter(tile => tile.status === 'board').map(tile => tile.type)).size >= 2],
  ];
  for (const [name, id, ready] of tools) {
    const button = document.getElementById(id);
    button.disabled = busy || game.status !== 'playing' || game.tools[name] || !ready;
    button.querySelector('small').textContent = game.tools[name] ? '已使用' : '1 次';
  }
  soundButton.setAttribute('aria-pressed', String(meta.soundOn));
  soundButton.setAttribute('aria-label', meta.soundOn ? '关闭声音' : '开启声音');
  soundButton.textContent = meta.soundOn ? '🔊' : '🔇';
}

function showDialog({ title, message, art = '🐷', actions }) {
  lastFocus = document.activeElement;
  dialogTitle.textContent = title;
  dialogMessage.textContent = message;
  dialogArt.textContent = art;
  dialogActions.replaceChildren(...actions.map(({ label, run, secondary = false }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (secondary) button.classList.add('secondary');
    button.addEventListener('click', () => { closeDialog(); run(); });
    return button;
  }));
  backdrop.hidden = false;
  $('.game-shell').inert = true;
  dialogActions.firstElementChild?.focus();
}

function closeDialog() {
  backdrop.hidden = true;
  $('.game-shell').inert = false;
  if (lastFocus?.isConnected && typeof lastFocus.focus === 'function') lastFocus.focus();
}

function startGame(level, date = chinaDate()) {
  game = createGame(level, date);
  busy = false;
  save();
  render();
  say(level === 'tutorial' ? '点击亮起的卡牌，凑齐三张相同图案。' : '今日牌局已准备好，祝你好运！');
}

function showOutcome() {
  if (game.status === 'won') {
    if (game.level === 'tutorial') {
      showDialog({ title: '新手猪圈通关！', message: '小猪学会三消啦！真正的挑战现在开始。', art: '🎉', actions: [
        { label: '进入今日挑战', run: () => startGame('daily') },
        { label: '再玩教学', secondary: true, run: () => startGame('tutorial') },
      ] });
    } else {
      showDialog({ title: '今日通关！', message: `成功清空猪圈！本机已记录 ${meta.dailyWins.length} 天通关。`, art: '🏆', actions: [
        { label: '再挑战一次', run: () => startGame('daily', game.date) },
        { label: '留在棋盘', secondary: true, run: () => {} },
      ] });
    }
  } else if (game.status === 'lost') {
    const actions = [];
    if (!game.tools.undo && game.lastMove) actions.push({ label: '撤回上一步', run: () => useTool('undo') });
    if (!game.reviveUsed) actions.push({ label: '免费复活一次', run: () => useTool('revive') });
    actions.push({ label: '重试本关', secondary: true, run: () => startGame(game.level, game.date ?? chinaDate()) });
    showDialog({ title: '收纳槽满啦！', message: '小猪还能再试试。善用道具，先清掉成对的图案。', art: '😵', actions });
  }
}

function celebrate(centerX, centerY, count = 12) {
  if (reducedMotion.matches) return;
  const layer = $('#spark-layer');
  const rect = layer.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const spark = document.createElement('i');
    spark.className = 'burst';
    spark.style.left = `${centerX - rect.left}px`;
    spark.style.top = `${centerY - rect.top}px`;
    spark.style.setProperty('--dx', `${(Math.random() - .5) * 150}px`);
    spark.style.setProperty('--dy', `${(Math.random() - .5) * 130}px`);
    spark.style.setProperty('--burst-color', ['#ffd163', '#f585a2', '#72cad4', '#fffde2'][i % 4]);
    layer.append(spark);
    setTimeout(() => spark.remove(), 600);
  }
}

async function flyToTray(element, targetIndex) {
  if (reducedMotion.matches) return;
  const from = element.getBoundingClientRect();
  const target = tray.children[Math.min(targetIndex, 6)]?.getBoundingClientRect();
  if (!target) return;
  const clone = element.cloneNode(true);
  clone.classList.remove('is-covered', 'is-entering');
  clone.classList.add('flying-card');
  Object.assign(clone.style, { position: 'fixed', left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, zIndex: '200', pointerEvents: 'none', margin: '0' });
  document.body.append(clone);
  const dx = target.left + target.width / 2 - (from.left + from.width / 2);
  const dy = target.top + target.height / 2 - (from.top + from.height / 2);
  try {
    await clone.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(.82)`, opacity: .92 },
    ], { duration: 230, easing: 'cubic-bezier(.22,.85,.28,1)', fill: 'forwards' }).finished;
  } catch { /* animation canceled */ }
  clone.remove();
}

function processEvents(events) {
  if (events.some(event => event.type === 'match')) {
    playSound('match');
    const rect = tray.getBoundingClientRect();
    celebrate(rect.left + rect.width / 2, rect.top, 14);
    say('漂亮！三张相同卡牌消除啦。');
  } else if (events.some(event => event.type === 'select')) {
    playSound('select');
    say(`收纳槽里有 ${game.tray.length} 张卡牌。`);
  }
  if (events.some(event => event.type === 'won')) {
    playSound('win');
    const rect = board.getBoundingClientRect();
    celebrate(rect.left + rect.width / 2, rect.top + rect.height / 2, 32);
    if (game.level === 'tutorial') meta.tutorialCleared = true;
    else if (!meta.dailyWins.includes(game.date)) meta.dailyWins.push(game.date);
    save();
    say('猪圈清空，挑战成功！');
    showOutcome();
  } else if (events.some(event => event.type === 'lost')) {
    playSound('lose');
    say('收纳槽已满。');
    showOutcome();
  }
}

async function selectTile(id, element) {
  if (busy || !backdrop.hidden) return;
  unlockAudio();
  const result = applyAction(game, { type: 'select', id });
  if (result.state === game) return;
  busy = true;
  const flight = flyToTray(element, game.tray.length);
  game = result.state;
  save();
  await flight;
  busy = false;
  render();
  processEvents(result.events);
}

async function useTool(type) {
  if (busy) return;
  unlockAudio();
  const result = applyAction(game, { type });
  if (result.state === game) {
    say(type === 'move' ? '收纳槽至少有 3 张牌时才能移出。' : '这个道具暂时无法使用。');
    return;
  }
  const before = game;
  game = result.state;
  save();
  if (type === 'shuffle' && !reducedMotion.matches) {
    busy = true;
    board.classList.add('shuffling');
    await new Promise(resolve => setTimeout(resolve, 260));
    board.classList.remove('shuffling');
  }
  busy = false;
  const returned = type === 'undo' ? game.tiles.find(tile => tile.status === 'board' && before.tiles[tile.id].status !== 'board')?.id : -1;
  render(returned);
  playSound(type === 'undo' ? 'undo' : 'tool');
  say({ undo: '上一步已撤回。', move: '三张牌暂放在上方，可以随时取回。', shuffle: '剩余卡牌已洗牌。', revive: '小猪复活啦！先处理收纳槽吧。' }[type]);
}

$('#tool-undo').addEventListener('click', () => useTool('undo'));
$('#tool-move').addEventListener('click', () => useTool('move'));
$('#tool-shuffle').addEventListener('click', () => useTool('shuffle'));
soundButton.addEventListener('click', () => {
  meta.soundOn = !meta.soundOn;
  setSoundEnabled(meta.soundOn);
  if (meta.soundOn) unlockAudio();
  save(); render();
  say(meta.soundOn ? '声音已开启。' : '声音已关闭。');
});
$('#help-button').addEventListener('click', () => {
  if (busy) return;
  showDialog({
    title: '怎么玩？', art: '💡',
    message: '只点亮起、没有被压住的卡牌。卡牌进入 7 格收纳槽，凑齐三张同图会自动消除；清空全部卡牌获胜。撤回、移出、洗牌每关各一次。',
    actions: [{ label: '明白了', run: () => {} }],
  });
});
$('#menu-button').addEventListener('click', () => {
  if (busy) return;
  const recent = meta.dailyWins.slice(-3).reverse().join('、');
  showDialog({
    title: '猪圈菜单', art: '🐽',
    message: meta.dailyWins.length ? `已通关 ${meta.dailyWins.length} 天。最近通关：${recent}` : '还没有每日通关记录，今天来挑战吧！',
    actions: [
      { label: '继续游戏', run: () => {} },
      { label: '重开本关', secondary: true, run: () => startGame(game.level, game.date ?? chinaDate()) },
      { label: '重玩教学', secondary: true, run: () => startGame('tutorial') },
      ...(meta.tutorialCleared ? [{ label: '今日挑战', secondary: true, run: () => startGame('daily') }] : []),
    ],
  });
});
backdrop.addEventListener('click', event => {
  if (event.target === backdrop && game.status === 'playing') closeDialog();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !backdrop.hidden && game.status === 'playing') closeDialog();
});
save();
render();
if (game.status !== 'playing') showOutcome();
