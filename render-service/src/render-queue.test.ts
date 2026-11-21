import { test } from "node:test";
import assert from "node:assert/strict";
import { RenderQueue, renderLimits } from "./render-queue.js";

test("multiple exports run concurrently, overflow waits in FIFO order", async () => {
  const queue = new RenderQueue(2);
  const started: number[] = [];
  const releases: Array<() => void> = [];
  const jobs = [0, 1, 2, 3].map((id) => queue.run(async () => {
    started.push(id);
    await new Promise<void>((resolve) => { releases[id] = resolve; });
  }));
  await new Promise(setImmediate);
  assert.deepEqual(started, [0, 1]);
  releases[1]();
  await new Promise(setImmediate);
  assert.deepEqual(started, [0, 1, 2]);
  releases[0]();
  await new Promise(setImmediate);
  assert.deepEqual(started, [0, 1, 2, 3]);
  releases[2]();
  releases[3]();
  await Promise.all(jobs);
});

test("failed exports release their slot, including synchronous failures", async () => {
  const queue = new RenderQueue(1);
  const failed = queue.run(() => { throw new Error("failed export"); });
  let completed = false;
  const next = queue.run(async () => { completed = true; });
  await assert.rejects(failed, /failed export/);
  await next;
  assert.equal(completed, true);
});

test("CPU budget is shared and invalid configuration falls back", () => {
  assert.deepEqual(renderLimits({}, 8), { jobs: 2, frames: 4 });
  assert.deepEqual(renderLimits({}, 1), { jobs: 1, frames: 1 });
  assert.deepEqual(renderLimits({ RENDER_CONCURRENT_JOBS: "4" }, 8), { jobs: 4, frames: 2 });
  assert.deepEqual(renderLimits({ RENDER_CONCURRENT_JOBS: "0", RENDER_FRAME_CONCURRENCY: "NaN" }, 8), { jobs: 2, frames: 4 });
  assert.deepEqual(renderLimits({ RENDER_FRAME_CONCURRENCY: "3" }, 8), { jobs: 2, frames: 3 });
});
