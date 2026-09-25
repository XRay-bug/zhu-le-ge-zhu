import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAction, chinaDate, createGame, isExposed, isValidGame, verifySolution,
} from '../dist/engine.mjs';

test('教学关可以沿构造路径通关，并正确解锁叠层牌', () => {
  let game = createGame('tutorial');
  assert.equal(game.tiles.length, 18);
  assert.ok(verifySolution(game.tiles, game.solution));
  const covered = game.tiles.find(tile => !isExposed(game.tiles, tile.id));
  assert.equal(applyAction(game, { type: 'select', id: covered.id }).state, game);
  for (const id of game.solution) {
    assert.ok(isExposed(game.tiles, id));
    game = applyAction(game, { type: 'select', id }).state;
  }
  assert.equal(game.status, 'won');
  assert.equal(game.tray.length, 0);
  assert.ok(game.tiles.every(tile => tile.status === 'gone'));
});

test('每日关卡固定种子且连续 90 天均存在通关路径', () => {
  const first = createGame('daily', '2026-09-25');
  const again = createGame('daily', '2026-09-25');
  assert.equal(first.tiles.length, 108);
  assert.deepEqual(first.tiles, again.tiles);
  for (let day = 0; day < 90; day++) {
    const date = new Date(Date.UTC(2026, 8, 25 + day)).toISOString().slice(0, 10);
    const game = createGame('daily', date);
    assert.ok(verifySolution(game.tiles, game.solution), date);
  }
});

test('上海日期在当地午夜切换', () => {
  assert.equal(chinaDate(new Date('2026-09-24T15:59:59Z')), '2026-09-24');
  assert.equal(chinaDate(new Date('2026-09-24T16:00:00Z')), '2026-09-25');
});

test('第三张匹配牌先消除，再检查七格上限；撤回可恢复该步', () => {
  let game = createGame('tutorial');
  const [a, b, c] = game.solution;
  game = applyAction(game, { type: 'select', id: a }).state;
  game = applyAction(game, { type: 'select', id: b }).state;
  const beforeThird = structuredClone(game);
  game = applyAction(game, { type: 'select', id: c }).state;
  assert.equal(game.tray.length, 0);
  assert.equal(game.tiles[c].status, 'gone');
  game = applyAction(game, { type: 'undo' }).state;
  assert.deepEqual(game.tray, beforeThird.tray);
  assert.equal(game.tiles[c].status, 'board');
  assert.equal(game.tools.undo, true);
  assert.equal(applyAction(game, { type: 'undo' }).state, game);
});

function seededTray(types) {
  const game = createGame('daily', '2026-09-25');
  const chosen = game.tiles.slice(0, types.length);
  chosen.forEach((tile, index) => { tile.status = 'tray'; tile.type = types[index]; });
  game.tray = chosen.map(tile => tile.id);
  const selected = game.tiles.find(tile => isExposed(game.tiles, tile.id));
  return { game, selected };
}

test('七格时若凑成三张仍继续；若无匹配则失败并可复活', () => {
  let { game, selected } = seededTray([0, 0, 1, 2, 3, 4]);
  selected.type = 0;
  game = applyAction(game, { type: 'select', id: selected.id }).state;
  assert.equal(game.status, 'playing');
  assert.equal(game.tray.length, 4);

  ({ game, selected } = seededTray([0, 1, 2, 3, 4, 5]));
  selected.type = 6;
  game = applyAction(game, { type: 'select', id: selected.id }).state;
  assert.equal(game.status, 'lost');
  game = applyAction(game, { type: 'revive' }).state;
  assert.equal(game.status, 'playing');
  assert.equal(game.tray.length, 4);
  assert.equal(game.aside.length, 3);
  assert.equal(game.reviveUsed, true);
});

test('移出牌可取回；洗牌保留剩余图案数量和槽内牌', () => {
  let { game } = seededTray([0, 1, 2]);
  const moved = [...game.tray];
  game = applyAction(game, { type: 'move' }).state;
  assert.equal(game.tray.length, 0);
  assert.deepEqual(game.aside, moved);
  game = applyAction(game, { type: 'select', id: moved[0] }).state;
  assert.equal(game.tray[0], moved[0]);
  assert.equal(game.aside.length, 2);
  const before = game.tiles.filter(tile => tile.status === 'board').map(tile => tile.type).sort();
  const trayBefore = [...game.tray];
  game = applyAction(game, { type: 'shuffle' }).state;
  assert.deepEqual(game.tiles.filter(tile => tile.status === 'board').map(tile => tile.type).sort(), before);
  assert.deepEqual(game.tray, trayBefore);
  assert.equal(game.tools.shuffle, true);
  assert.ok(isValidGame(game));
});
