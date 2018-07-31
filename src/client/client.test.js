/*
 * Copyright 2017 The boardgame.io Authors
 *
 * Use of this source code is governed by a MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { createStore } from 'redux';
import { CreateGameReducer } from '../core/reducer';
import {
  Client,
  createEventDispatchers,
  createMoveDispatchers,
} from './client';
import { gameEvent } from '../core/action-creators';
import Game from '../core/game';
import { RandomBot } from '../ai/bot';

test('move api', () => {
  const client = Client({
    game: Game({
      moves: {
        A: (G, ctx, arg) => ({ arg }),
      },
    }),
  });

  expect(client.getState().G).toEqual({});
  client.moves.A(42);
  expect(client.getState().G).toEqual({ arg: 42 });
});

test('isActive', () => {
  const client = Client({
    game: Game({
      moves: {
        A: (G, ctx, arg) => ({ arg }),
      },

      flow: {
        endGameIf: G => G.arg == 42,
      },
    }),
  });

  expect(client.getState().G).toEqual({});
  expect(client.getState().isActive).toBe(true);
  client.moves.A(42);
  expect(client.getState().G).toEqual({ arg: 42 });
  expect(client.getState().isActive).toBe(false);
});

describe('step', () => {
  const client = Client({
    game: Game({
      setup: () => ({ moved: false }),

      moves: {
        clickCell(G) {
          return { moved: !G.moved };
        },
      },

      flow: {
        endGameIf(G) {
          if (G.moved) return true;
        },
      },
    }),

    ai: {
      bot: RandomBot,
      enumerate: () => [{ move: 'clickCell' }],
    },
  });

  test('advances game state', () => {
    expect(client.getState().G).toEqual({ moved: false });
    client.step();
    expect(client.getState().G).toEqual({ moved: true });
  });

  test('does not crash on empty action', () => {
    const client = Client({
      game: Game({}),

      ai: {
        bot: RandomBot,
        enumerate: () => [],
      },
    });
    client.step();
  });
});

test('multiplayer server set when provided', () => {
  let host = 'host';
  let port = '4321';

  const client = Client({
    game: Game({}),
    multiplayer: { server: host + ':' + port },
  });

  client.connect();

  expect(client.multiplayerClient.socket.io.engine.hostname).toEqual(host);
  expect(client.multiplayerClient.socket.io.engine.port).toEqual(port);
});

test('accepts enhancer for store', () => {
  let spyDispatcher;
  const spyEnhancer = vanillaCreateStore => (...args) => {
    const vanillaStore = vanillaCreateStore(...args);
    return {
      ...vanillaStore,
      dispatch: (spyDispatcher = jest.fn(vanillaStore.dispatch)),
    };
  };
  const client = Client({
    game: Game({
      moves: {
        A: (G, ctx, arg) => ({ arg }),
      },
    }),
    enhancer: spyEnhancer,
  });

  expect(spyDispatcher.mock.calls.length).toBe(0);
  client.moves.A(42);
  expect(spyDispatcher.mock.calls.length).toBe(1);
});

test('event dispatchers', () => {
  {
    const game = Game({});
    const reducer = CreateGameReducer({ game, numPlayers: 2 });
    const store = createStore(reducer);
    const api = createEventDispatchers(game.flow.eventNames, store);
    expect(Object.getOwnPropertyNames(api)).toEqual(['endTurn']);
    expect(store.getState().ctx.turn).toBe(0);
    api.endTurn();
    expect(store.getState().ctx.turn).toBe(1);
  }

  {
    const game = Game({
      flow: {
        endPhase: true,
        endGame: true,
        setActionPlayers: true,
      },
    });
    const reducer = CreateGameReducer({ game, numPlayers: 2 });
    const store = createStore(reducer);
    const api = createEventDispatchers(game.flow.eventNames, store);
    expect(Object.getOwnPropertyNames(api)).toEqual([
      'endTurn',
      'endPhase',
      'endGame',
      'setActionPlayers',
    ]);
    expect(store.getState().ctx.turn).toBe(0);
    api.endTurn();
    expect(store.getState().ctx.turn).toBe(1);
  }

  {
    const game = Game({
      flow: {
        endPhase: false,
        endTurn: false,
      },

      phases: [{ name: 'default' }],
    });
    const reducer = CreateGameReducer({ game, numPlayers: 2 });
    const store = createStore(reducer);
    const api = createEventDispatchers(game.flow.eventNames, store);
    expect(Object.getOwnPropertyNames(api)).toEqual([]);
  }

  {
    const game = Game({
      flow: {
        endPhase: true,
        undoableMoves: ['A'],
      },
    });
    const reducer = CreateGameReducer({ game, numPlayers: 2 });
    const store = createStore(reducer);
    const api = createEventDispatchers(game.flow.eventNames, store);
    expect(Object.getOwnPropertyNames(api)).toEqual(['endTurn', 'endPhase']);
    expect(store.getState().ctx.turn).toBe(0);
    api.endTurn();
    expect(store.getState().ctx.turn).toBe(1);
  }
});

describe('move dispatchers', () => {
  const game = Game({
    moves: {
      A: G => G,
      B: (G, ctx) => ({ moved: ctx.playerID }),
      C: () => ({ victory: true }),
    },
    flow: {
      endGameIf: (G, ctx) => (G.victory ? ctx.currentPlayer : undefined),
    },
  });
  const reducer = CreateGameReducer({ game });

  test('basic', () => {
    const store = createStore(reducer);
    const api = createMoveDispatchers(game.moveNames, store);

    expect(Object.getOwnPropertyNames(api)).toEqual(['A', 'B', 'C']);
    expect(api.unknown).toBe(undefined);

    api.A();
    expect(store.getState().G).not.toMatchObject({ moved: true });
    expect(store.getState().G).not.toMatchObject({ victory: true });

    api.B();
    expect(store.getState().G).toMatchObject({ moved: '0' });

    store.dispatch(gameEvent('endTurn', null, '0'));

    api.B();
    expect(store.getState().G).toMatchObject({ moved: '1' });

    api.C();
    expect(store.getState().G).toMatchObject({ victory: true });
  });

  test('with undefined playerID - singleplayer mode', () => {
    const store = createStore(reducer);
    const api = createMoveDispatchers(game.moveNames, store);
    api.B();
    expect(store.getState().G).toMatchObject({ moved: '0' });
  });

  test('with undefined playerID - multiplayer mode', () => {
    const store = createStore(reducer);
    const api = createMoveDispatchers(
      game.moveNames,
      store,
      undefined,
      null,
      true
    );
    api.B();
    expect(store.getState().G).toMatchObject({ moved: undefined });
  });

  test('with null playerID - singleplayer mode', () => {
    const store = createStore(reducer);
    const api = createMoveDispatchers(game.moveNames, store, null);
    api.B();
    expect(store.getState().G).toMatchObject({ moved: '0' });
  });

  test('with null playerID - multiplayer mode', () => {
    const store = createStore(reducer);
    const api = createMoveDispatchers(game.moveNames, store, null, null, true);
    api.B();
    expect(store.getState().G).toMatchObject({ moved: null });
  });
});
