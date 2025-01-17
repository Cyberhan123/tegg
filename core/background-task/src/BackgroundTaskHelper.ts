import { AccessLevel, ContextProto, Inject } from '@eggjs/core-decorator';
import type { EggLogger } from 'egg';
import { EggObjectLifecycle } from '@eggjs/tegg-lifecycle';

@ContextProto({
  accessLevel: AccessLevel.PUBLIC,
})
export class BackgroundTaskHelper implements EggObjectLifecycle {
  @Inject()
  logger: EggLogger;

  // default timeout for async task
  timeout = 5000;

  private backgroundTasks: Array<Promise<void>> = [];

  run(fn: () => Promise<void>) {
    const backgroundTask = new Promise<void>(resolve => {
      try {
        fn()
          // fn is resolve, resolve the task
          .then(resolve)
          .catch(e => {
            e.message = '[BackgroundTaskHelper] background throw error:' + e.message;
            this.logger.error(e);
            // fn is rejected, resolve the task
            resolve();
          });
      } catch (e) {
        e.message = '[BackgroundTaskHelper] create background throw error:' + e.message;
        this.logger.error(e);
        // create task failed, resolve the task
        resolve();
      }
    });

    this.backgroundTasks.push(backgroundTask);
  }

  async preDestroy(): Promise<void> {
    // quick quit
    if (!this.backgroundTasks.length) return;

    const { promise: timeout, resolve } = this.sleep();

    await Promise.race([
      // not block the pre destroy process too long
      timeout,
      // ensure all background task are done before destroy the context
      Promise.all(this.backgroundTasks),
    ]);

    // always resolve the sleep promise
    resolve();
  }

  private sleep() {
    let timer;
    let promiseResolve;
    const now = Date.now();

    const p = new Promise<void>(r => {
      promiseResolve = r;
      timer = setTimeout(() => {
        this.logger.error(`[BackgroundTaskHelper] task is timeout actual is ${Date.now() - now} expect is ${this.timeout}`);
        r();
      }, this.timeout);
    });

    function resolve() {
      // clear timeout and resolve the promise
      clearTimeout(timer);
      promiseResolve();
    }

    return {
      promise: p,
      resolve,
    };
  }
}
