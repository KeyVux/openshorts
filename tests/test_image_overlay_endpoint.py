"""Exercise retained overlays through HTTP, including reopening and removal."""
import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from PIL import Image

import app as server
import media_effects


class ImageOverlayEndpointTests(unittest.TestCase):
    def test_reopen_move_and_remove_use_original_source(self):
        async def exercise():
            with tempfile.TemporaryDirectory() as temp:
                job_id = 'overlay-test'
                directory = Path(temp) / job_id
                directory.mkdir()
                source = directory / 'clip.mp4'
                source.write_bytes(b'original-video')
                (directory / 'test_metadata.json').write_text(json.dumps({'shorts': [{}]}))
                server.jobs[job_id] = {'result': {'clips': [{}]}}
                calls = []

                def render(input_path, output, **settings):
                    calls.append((input_path, settings))
                    Path(output).write_bytes(b'rendered-video')

                async def deliver(request, job_id, filename):
                    return filename

                try:
                    with patch.object(server, 'OUTPUT_DIR', temp), \
                         patch.object(server, 'require_managed_entitlement', AsyncMock()), \
                         patch.object(server, '_ensure_job_files', AsyncMock()), \
                         patch.object(server, '_assert_job_owner', AsyncMock()), \
                         patch.object(server, '_strip_burned_captions', side_effect=lambda d, f: f), \
                         patch.object(server, '_deliver', side_effect=deliver), \
                         patch.object(media_effects, 'render', side_effect=render):
                        transport = httpx.ASGITransport(app=server.app)
                        async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
                            import io
                            png = io.BytesIO()
                            Image.new('RGBA', (80, 40), (255, 0, 0, 128)).save(png, format='PNG')
                            body = {'job_id': job_id, 'clip_index': '0', 'input_filename': source.name,
                                    'images_only': 'true', 'watermark_mode': 'upload',
                                    'image_layout': json.dumps({'watermark': {'x': .1, 'y': .2, 'width': .3}})}
                            response = await client.post('/api/clip/media', data=body,
                                                         files={'watermark': ('logo.png', png.getvalue(), 'image/png')})
                            self.assertEqual(response.status_code, 200, response.text)
                            first = os.path.basename(response.json()['new_video_url'])
                            state = await client.get('/api/clip/media-state', params={'job_id': job_id, 'input_filename': first})
                            self.assertEqual(state.status_code, 200, state.text)
                            self.assertTrue(state.json()['images']['watermark'].startswith('data:image/png;base64,'))
                            self.assertEqual(state.json()['layout']['watermark']['x'], .1)
                            body.update(input_filename=first, watermark_mode='keep',
                                        image_layout=json.dumps({'watermark': {'x': .5, 'y': .4, 'width': .2}}))
                            response = await client.post('/api/clip/media', data=body)
                            self.assertEqual(response.status_code, 200, response.text)
                            second = os.path.basename(response.json()['new_video_url'])
                            self.assertEqual(calls[-1][0], str(source.resolve()))
                            self.assertTrue(Path(calls[-1][1]['watermark']).is_file())
                            self.assertEqual(calls[-1][1]['layout']['watermark']['x'], .5)
                            body.update(input_filename=second, watermark_mode='none')
                            response = await client.post('/api/clip/media', data=body)
                            self.assertEqual(response.status_code, 200, response.text)
                            self.assertNotIn('watermark', calls[-1][1])
                            self.assertEqual(calls[-1][0], str(source.resolve()))
                finally:
                    server.jobs.pop(job_id, None)
        asyncio.run(exercise())


if __name__ == '__main__':
    unittest.main()
