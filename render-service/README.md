# Render throughput

Exports run through a FIFO queue, with two simultaneous videos by default
(one on a single-CPU host when not overridden). Additional exports remain
`queued` and start as running exports finish, including after failures.

`RENDER_CONCURRENT_JOBS` controls simultaneous exports. `RENDER_FRAME_CONCURRENCY`
controls parallel frames within each export; by default the available CPU count
is divided between the export slots. For a host shared with the Python backend,
set this explicitly to leave CPU capacity for clip generation, for example two
exports with two frames each. Set these in `.env` for Docker Compose and rebuild
the renderer with `docker compose up -d --build renderer`.

Each export reuses one browser for composition selection and rendering, then
closes it before releasing its slot. Encoding quality remains H.264 CRF 22.
Throughput depends on video size, effects, available memory and other workloads;
compare batch completion times on your target host when tuning these values.

Run `npm test` for queue and composition tests, or
`node --import tsx --test src/render-queue.test.ts` for queue tests without Chromium.
