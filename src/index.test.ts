import { BucketOptions } from 'simple-token-bucket';

import type { EnqueueOptions, ShortlyOptions } from './index';
import { BucketOverflowError, Shortly } from './index';

const delay = (n: number) => new Promise(resolve => setTimeout(resolve, n));
const flushPromises = () => new Promise(jest.requireActual('timers').setImmediate);

const OPTS = {
  capacity: 10,
  fillQuantity: 1,
  fillTime: 1000,
  initialCapacity: 0,
};

describe('Shortly', () => {
  const init = (shopts?: ShortlyOptions, bucketOptsOverride?: Partial<BucketOptions>) =>
    new Shortly({ ...OPTS, ...bucketOptsOverride }, shopts);

  const expectAfter = async (ms: number, promise: Promise<void>) => {
    const cb = jest.fn();
    promise.then(cb);
    expect(promise).resolves.toBeUndefined();
    if (ms > 0) {
      await flushPromises();
      expect(cb).toHaveBeenCalledTimes(0);
      jest.advanceTimersByTime(ms);
    }
    await flushPromises();
    expect(cb).toHaveBeenCalledTimes(1);
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  describe('#wait', function () {
    it('should resolve immediately if there is capacity', async () => {
      const { wait } = init({}, { initialCapacity: 1 });
      await expectAfter(0, wait());
    });

    it('should resolve after capacity is available', async () => {
      const { wait } = init();
      await expectAfter(1000, wait());
    });

    type request = Partial<EnqueueOptions> & { name: string };
    const tests: {
      name: string;
      reqs: request[];
      winner?: string;
      capacity: number;
    }[] = [
      {
        name: 'capacity available, first come first served',
        reqs: [
          { priority: 0, name: 'low priority' },
          { priority: 100, name: 'high priority' },
        ],
        capacity: 1,
      },
      {
        name: 'highest priority first',
        reqs: [
          { priority: 0, name: 'low priority' },
          { priority: 100, name: 'high priority' },
        ],
        winner: 'high priority',
        capacity: 0,
      },
      {
        name: 'priority wins over token count',
        reqs: [
          { priority: 0, tokens: 1, name: 'low priority' },
          { priority: 100, tokens: 10, name: 'high priority' },
        ],
        winner: 'high priority',
        capacity: 0,
      },
      {
        name: 'lowest token count wins when priority is equal',
        reqs: [
          { priority: 0, tokens: 1, name: 'low token count' },
          { priority: 0, tokens: 10, name: 'high token count' },
        ],
        winner: 'low token count',
        capacity: 0,
      },
    ];
    describe.each(tests)('$name', test => {
      it('straight', async () => {
        const { wait } = init({}, { initialCapacity: test.capacity });
        Promise.race(test.reqs.map(req => wait(req).then(() => req.name))).then(winner => {
          expect(winner).toBe(test.winner ?? test.reqs[0].name);
        });
        jest.advanceTimersByTime(1000);
        await flushPromises();
      });
      it('reversed', async () => {
        const { wait } = init({}, { initialCapacity: test.capacity });
        const reversed = test.reqs.slice().reverse();
        Promise.race(reversed.map(req => wait(req).then(() => req.name))).then(winner => {
          expect(winner).toBe(test.winner ?? reversed[0].name);
        });
        jest.advanceTimersByTime(1000);
        await flushPromises();
      });
    });
  });
  describe('with limit option', () => {
    type request = Partial<EnqueueOptions> & { name: string };
    const tests: {
      name: string;
      reqs: request[];
      loser?: string;
    }[] = [
      {
        name: 'highest priority first',
        reqs: [
          { priority: 0, name: 'low priority' },
          { priority: 100, name: 'high priority' },
        ],
        loser: 'low priority',
      },
      {
        name: 'priority wins over token count',
        reqs: [
          { priority: 0, tokens: 1, name: 'low priority' },
          { priority: 100, tokens: 10, name: 'high priority' },
        ],
        loser: 'low priority',
      },
      {
        name: 'lowest token count wins when priority is equal',
        reqs: [
          { priority: 0, tokens: 1, name: 'low token count' },
          { priority: 0, tokens: 10, name: 'high token count' },
        ],
        loser: 'high token count',
      },
    ];
    describe.each(tests)('$name', test => {
      it('straight', async () => {
        const { wait } = init({ limit: 1 }, { initialCapacity: 0 });
        Promise.race(
          test.reqs.map(req =>
            wait(req).catch(err => {
              expect(err).toBeInstanceOf(BucketOverflowError);
              expect(err.message!).toMatch('Queue is full');
              return req.name;
            })
          )
        ).then(loser => {
          expect(loser).toBe(test.loser ?? test.reqs[test.reqs.length - 1].name);
        });
        await flushPromises();
      });
      it('reversed', async () => {
        const { wait } = init({ limit: 1 }, { initialCapacity: 0 });
        const reversed = test.reqs.slice().reverse();
        Promise.race(
          reversed.map(req =>
            wait(req).catch(err => {
              expect(err).toBeInstanceOf(BucketOverflowError);
              expect(err.message!).toMatch('Queue is full');
              return req.name;
            })
          )
        ).then(loser => {
          expect(loser).toBe(test.loser ?? test.reqs[test.reqs.length - 1].name);
        });
        jest.advanceTimersByTime(1000);
        await flushPromises();
      });
    });
  });
});
