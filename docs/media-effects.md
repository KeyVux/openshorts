# Music, overlays and vertical framing

On a generated clip, choose **Music, watermark & lower-third image**.
Choose custom files or API sources independently for each asset; all three
can be combined. Each file is limited to 30 MB. PNG watermarks retain transparency.

Music loops to the clip duration. Music and original sound each have independent
0–200% volume controls. The watermark fits inside 18% of the frame width at the
top right; the lower-third picture fits inside 65% of the width and starts at
two-thirds of the frame height. Both images preserve their aspect ratio and
remain visible throughout the clip.

Enable **Exact 9:16** to export 1080 × 1920. The current clip is centered,
with a blurred, enlarged copy filling the surrounding frame. Each top/bottom
blurred area is half the height of the full-picture fit. The foreground is
enlarged and its sides may be cropped. Already vertical footage fills the frame.
This uses the current rendered clip; it cannot recover material previously cropped
out. Overlays are added after framing, so they stay sharp.

**Render in background** closes the dialog immediately and shows status on the
clip card. You can use the rest of the dashboard while it renders; keep the
dashboard open for the completion update. The current clip's editing controls
are disabled during its render to avoid conflicting edits.

Rendering saves a new current video, retaining the previous file.
Server captions are removed from the input and restored after compositing,
so images cannot cover them. Browser caption layers are also rendered on top
of the finished media. A retained uncaptioned file is needed to move captions
that were already burned into a video.
Repeated applies stack changes. Add subtitles and other edits before this final
finishing pass, because source-based reframing and recutting can replace it.

## API configuration

Set `PIXABAY_API_KEY` on the backend, or enter a key in the dialog for that request.
Watermark and lower-third API sources pick a random image from the Pixabay
search results. Queries are cached for 24 hours and images are downloaded before
rendering. Pixabay attribution is linked in the dialog.

Pixabay's documented API supports images and videos, with no public music endpoint:
https://pixabay.com/api/docs/
For music, upload your own track (including music downloaded from Pixabay), or
set `MUSIC_LIBRARY_API_URL` on the backend to a public JSON endpoint:

```json
{"tracks": [{"url": "https://example.com/licensed-track.mp3"}]}
```

The library is cached for 24 hours. One track is chosen randomly per apply.
Track URLs must use HTTPS; downloads are bounded and private network destinations
are blocked. Use tracks you have permission to include in your videos.
API keys are sent only with the apply request and are not stored in project metadata.

`POST /api/clip/media` accepts multipart form fields `job_id`, `clip_index`,
`input_filename`, `music_volume`, `original_volume`, `blurred_vertical`,
`music_mode`, `watermark_mode`, `picture_mode` (`none`, `upload`, `api`),
`watermark_query`, `picture_query`, and `pixabay_key`. File fields are `music`,
`watermark`, `picture`. The response contains `new_video_url`.
