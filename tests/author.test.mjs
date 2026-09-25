import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createGame, isValidGame } from '../dist/engine.mjs';
import { applyAuthorAction, isAuthorShortcut } from '../dist/author.mjs';

test('作者面板只接受完整且非重复的 Ctrl+Alt+Shift+P', () => {
  const shortcut = { code: 'KeyP', ctrlKey: true, altKey: true, shiftKey: true,
    metaKey: false, repeat: false };
  assert.equal(isAuthorShortcut(shortcut), true);
  for (const key of ['ctrlKey', 'altKey', 'shiftKey']) {
    assert.equal(isAuthorShortcut({ ...shortcut, [key]: false }), false);
  }
  assert.equal(isAuthorShortcut({ ...shortcut, code: 'KeyO' }), false);
  assert.equal(isAuthorShortcut({ ...shortcut, metaKey: true }), false);
  assert.equal(isAuthorShortcut({ ...shortcut, repeat: true }), false);
  assert.equal(isAuthorShortcut(null), false);
});

test('快速通关消除棋盘、收纳槽与暂存牌，并发出正常胜利事件', () => {
  let game = createGame('tutorial');
  for (const id of game.solution.slice(0, 3)) game = applyAction(game, { type: 'select', id }).state;
  game = applyAction(game, { type: 'select', id: game.solution[3] }).state;
  const result = applyAuthorAction(game, 'quick-win');
  assert.equal(result.state.status, 'won');
  assert.equal(result.state.tray.length, 0);
  assert.equal(result.state.aside.length, 0);
  assert.ok(result.state.tiles.every(tile => tile.status === 'gone'));
  assert.ok(result.events.some(event => event.type === 'won'));
  assert.ok(isValidGame(result.state));
  assert.equal(applyAuthorAction(result.state, 'quick-win').state, result.state);
});

test('清空收纳槽把牌视为已消除，并让失败局继续游戏', () => {
  const game = createGame('tutorial');
  assert.equal(applyAuthorAction(game, 'clear-tray').state, game);
  const lost = applyAuthorAction(game, 'simulate-loss').state;
  const ids = [...lost.tray];
  const result = applyAuthorAction(lost, 'clear-tray');
  assert.equal(result.state.status, 'playing');
  assert.deepEqual(result.state.tray, []);
  assert.ok(ids.every(id => result.state.tiles[id].status === 'gone'));
  assert.ok(isValidGame(result.state));
});

test('道具重置恢复撤回、移出、洗牌和复活的使用次数', () => {
  const game = createGame('daily', '2026-09-25');
  game.tools = { undo: true, move: true, shuffle: true };
  game.reviveUsed = true;
  const result = applyAuthorAction(game, 'reset-tools');
  assert.deepEqual(result.state.tools, { undo: false, move: false, shuffle: false });
  assert.equal(result.state.reviveUsed, false);
  assert.deepEqual(game.tools, { undo: true, move: true, shuffle: true });
  assert.ok(isValidGame(result.state));
  assert.equal(applyAuthorAction(result.state, 'reset-tools').state, result.state);
});

test('模拟失败填满七格，能通过现有撤回或复活流程恢复', () => {
  const game = createGame('daily', '2026-09-25');
  const result = applyAuthorAction(game, 'simulate-loss');
  const lost = result.state;
  assert.equal(lost.status, 'lost');
  assert.equal(lost.tray.length, 7);
  assert.ok(Math.max(...Array.from({ length: 9 }, (_, type) =>
    lost.tray.filter(id => lost.tiles[id].type === type).length)) <= 2);
  assert.ok(result.events.some(event => event.type === 'lost'));
  assert.ok(isValidGame(lost));

  const undone = applyAction(lost, { type: 'undo' }).state;
  assert.equal(undone.status, 'playing');
  assert.deepEqual(undone.tiles, game.tiles);
  assert.deepEqual(undone.tray, game.tray);

  const revived = applyAction(lost, { type: 'revive' }).state;
  assert.equal(revived.status, 'playing');
  assert.equal(revived.tray.length, 4);
  assert.equal(revived.aside.length, 3);
  assert.ok(isValidGame(revived));
});

test('模拟失败在临近清盘时仍可用；非法操作保持原对象', () => {
  const game = createGame('tutorial');
  for (const tile of game.tiles.slice(0, -2)) tile.status = 'gone';
  const result = applyAuthorAction(game, 'simulate-loss');
  assert.equal(result.state.status, 'lost');
  assert.equal(result.state.tray.length, 7);
  assert.ok(isValidGame(result.state));
  assert.equal(applyAuthorAction(result.state, 'simulate-loss').state, result.state);
  assert.equal(applyAuthorAction(game, 'unknown').state, game);
  assert.equal(applyAuthorAction(null, 'quick-win').state, null);
});
