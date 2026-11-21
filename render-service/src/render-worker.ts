import fs from "node:fs";
import path from "node:path";
import { selectComposition, renderMedia, openBrowser } from "@remotion/renderer";
import { limits } from "./render-queue.js";
import { getBundleLocation } from "./bundle.js";
import { renderJobs } from "./server.js";

export interface RenderParams {
  renderId: string;
  jobId: string;
  clipIndex: number;
  props: {
    videoUrl: string;
    durationInFrames: number;
    fps: number;
    width: number;
    height: number;
    subtitles: unknown;
    hook: unknown;
    effects: unknown;
  };
}

/**
 * Executes a Remotion render in the background.
 * Updates the in-memory render job map with progress and final status.
 */
export async function executeRender(params: RenderParams): Promise<void> {
  const { renderId, jobId, clipIndex, props } = params;
  const job = renderJobs.get(renderId);

  if (!job) {
    console.error(`[render-worker] Job ${renderId} not found in map`);
    return;
  }

  let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;
  try {
    job.status = "rendering";
    job.progress = 0;

    console.log(
      `[render-worker] Starting render ${renderId} (job=${jobId}, clip=${clipIndex})`
    );

    const bundleLocation = getBundleLocation();
    browser = await openBrowser("chrome");

    // Select the composition with the provided input props
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "ShortVideo",
      inputProps: props,
      puppeteerInstance: browser,
    });

    // Determine output directory and file path
    const outputDir = process.env.OUTPUT_DIR
      ? path.resolve(process.env.OUTPUT_DIR)
      : path.resolve(import.meta.dirname, "../../output");

    const jobOutputDir = path.join(outputDir, jobId);
    fs.mkdirSync(jobOutputDir, { recursive: true });

    const outputFileName = `remotion_${clipIndex}_${renderId}.mp4`;
    const outputLocation = path.join(jobOutputDir, outputFileName);

    console.log(`[render-worker] Output: ${outputLocation}`);

    // Render the video
    let lastLoggedPercent = -1;
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      inputProps: props,
      puppeteerInstance: browser,
      concurrency: limits.frames,
      codec: "h264",
      crf: 22,
      outputLocation,
      onProgress: ({ progress }) => {
        const percent = Math.round(progress * 100);
        job.progress = percent;

        if (percent % 10 === 0 && percent !== lastLoggedPercent) {
          lastLoggedPercent = percent;
          console.log(`[render-worker] ${renderId} progress: ${percent}%`);
        }
      },
    });

    // Success
    job.status = "done";
    job.progress = 100;
    job.outputUrl = outputLocation;

    console.log(`[render-worker] Render ${renderId} completed: ${outputLocation}`);
  } catch (err) {
    job.status = "error";
    job.error = err instanceof Error ? err.message : String(err);

    console.error(`[render-worker] Render ${renderId} failed:`, err);
  } finally {
    await browser?.close({ silent: true }).catch((err) => {
      console.error(`[render-worker] Browser cleanup failed for ${renderId}:`, err);
    });
  }
}
