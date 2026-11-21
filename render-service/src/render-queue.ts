import { availableParallelism } from "node:os";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function renderLimits(env: NodeJS.ProcessEnv = process.env, cpus = availableParallelism()) {
  const jobs = positiveInteger(env.RENDER_CONCURRENT_JOBS, Math.min(2, cpus));
  const frames = positiveInteger(env.RENDER_FRAME_CONCURRENCY, Math.max(1, Math.floor(cpus / jobs)));
  return { jobs, frames };
}

/** FIFO admission keeps batches from launching unlimited Chromium instances. */
export class RenderQueue {
  private active = 0;
  private pending: Array<() => void> = [];

  constructor(private readonly concurrency: number) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
      throw new Error("Render concurrency must be a positive integer");
    }
  }

  run(task: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.pending.push(() => {
        this.active++;
        Promise.resolve().then(task).then(resolve, reject).finally(() => {
          this.active--;
          this.drain();
        });
      });
      this.drain();
    });
  }

  private drain(): void {
    while (this.active < this.concurrency && this.pending.length) {
      this.pending.shift()!();
    }
  }
}

export const limits = renderLimits();
export const renderQueue = new RenderQueue(limits.jobs);
