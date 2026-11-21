"""Bounded asset downloads and FFmpeg compositing for finished clips."""
import json
import os
import random
import subprocess
import time
import math
from urllib.parse import urlparse

import requests
from ssrf_guard import guarded
from security_utils import assert_public_url

LIMIT = 30 * 1024 * 1024
_cache = {}


def resolve_source(directory, filename):
    """Resolve the explicit editor input, including retained edit versions."""
    if (not filename or '/' in filename or '\\' in filename or ':' in filename
            or not filename.endswith('.mp4')):
        raise ValueError('Invalid input filename')
    root = os.path.realpath(directory)
    path = os.path.realpath(os.path.join(root, filename))
    if os.path.commonpath([root, path]) != root:
        raise ValueError('Invalid input filename')
    if not os.path.isfile(path):
        raise FileNotFoundError(filename)
    return path


def download(url, destination):
    assert_public_url(url)
    with guarded(), requests.get(url, stream=True, timeout=30) as response:
        response.raise_for_status()
        size = 0
        with open(destination, 'wb') as target:
            for chunk in response.iter_content(65536):
                size += len(chunk)
                if size > LIMIT:
                    raise ValueError('Asset exceeds 30 MB')
                target.write(chunk)


def random_asset(kind, query='', key=''):
    if kind == 'music':
        # A deployment-controlled JSON library: {"tracks": [{"url": "https://..."}]}.
        url = os.environ.get('MUSIC_LIBRARY_API_URL', '')
        if not url:
            raise ValueError('Set MUSIC_LIBRARY_API_URL or upload music. Pixabay has no public music API.')
        params = {}
    else:
        url = 'https://pixabay.com/api/'
        key = key or os.environ.get('PIXABAY_API_KEY', '')
        if not key:
            raise ValueError('Enter a Pixabay API key or configure PIXABAY_API_KEY')
        params = dict(key=key, q=query[:100], image_type='photo', safesearch='true', per_page=50)
    cache_key = (url, tuple(sorted(params.items())))
    cached = _cache.get(cache_key)
    if not cached or time.time() - cached[0] > 86400:
        assert_public_url(url)
        with guarded():
            response = requests.get(url, params=params, timeout=20)
            response.raise_for_status()
            data = response.json()
        entries = data.get('tracks' if kind == 'music' else 'hits', [])
        urls = [item.get('url' if kind == 'music' else 'largeImageURL') for item in entries]
        urls = [u for u in urls if isinstance(u, str) and urlparse(u).scheme == 'https']
        _cache[cache_key] = (time.time(), urls)
    urls = _cache[cache_key][1]
    if not urls:
        raise ValueError('No matching assets found')
    return random.choice(urls)


def probe(path):
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', path],
                            capture_output=True, text=True, timeout=30, check=True)
    return json.loads(result.stdout)


def foreground_height(width, height):
    """Halve each band compared with fitting the full picture into 9:16."""
    fitted = min(1920, 1080 * height / width)
    return int((1920 + fitted) / 2) // 2 * 2


def validate_layout(value):
    if not isinstance(value, dict):
        raise ValueError('Invalid image layout')
    result = {}
    for kind in ('watermark', 'picture'):
        if kind not in value:
            continue
        item = value[kind]
        if not isinstance(item, dict):
            raise ValueError('Invalid image layout')
        result[kind] = {}
        for name in ('x', 'y', 'width'):
            number = float(item[name])
            if not math.isfinite(number) or not 0 <= number <= 1 or (name == 'width' and number < .02):
                raise ValueError('Image positions and sizes must be within the video')
            result[kind][name] = number
    return result


def render(source, output, music=None, watermark=None, picture=None, music_volume=.2, original_volume=1, blurred_vertical=False, layout=None):
    layout = validate_layout(layout or {})
    info = probe(source)
    video = next(s for s in info['streams'] if s['codec_type'] == 'video')
    width, height = int(video['width']), int(video['height'])
    duration = float(info['format']['duration'])
    command = ['ffmpeg', '-y', '-i', source]
    filters, current, idx = [], '0:v', 1
    if blurred_vertical:
        front_height = foreground_height(width, height)
        width, height = 1080, 1920
        filters += ['[0:v]split=2[bg][fg]',
                    '[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:2[blur]',
                    f'[fg]scale=1080:{front_height}:force_original_aspect_ratio=increase,crop=1080:{front_height},setsar=1[front]',
                    '[blur][front]overlay=(W-w)/2:(H-h)/2,setsar=1[vertical]']
        current = 'vertical'
    for kind, asset, ratio, position in [('watermark', watermark, .18, 'W-w-24:24'), ('picture', picture, .65, '(W-w)/2:2*H/3')]:
        if not asset:
            continue
        streams = probe(asset)['streams']
        if not any(s['codec_type'] == 'video' for s in streams):
            raise ValueError('Overlay must be an image')
        command += ['-loop', '1', '-i', asset]
        placement = layout.get(kind)
        if placement:
            size = max(2, int(width * placement['width']))
            scaling = f'scale={size}:-1'
            position = f"{width * placement['x']}:{height * placement['y']}"
        else:
            scaling = f'scale={int(width*ratio)//2*2}:{int(height*.28)//2*2}:force_original_aspect_ratio=decrease'
        filters += [f'[{idx}:v]{scaling},setsar=1,format=rgba[img{idx}]',
                    f'[{current}][img{idx}]overlay={position}:shortest=1[v{idx}]']
        current = f'v{idx}'
        idx += 1
    audio = any(s['codec_type'] == 'audio' for s in info['streams'])
    if audio:
        filters.append(f'[0:a]volume={original_volume}[original]')
    if music:
        if not any(s['codec_type'] == 'audio' for s in probe(music)['streams']):
            raise ValueError('Music file has no audio stream')
        command += ['-stream_loop', '-1', '-i', music]
        filters.append(f'[{idx}:a]volume={music_volume}[music]')
        if audio:
            filters.append('[original][music]amix=inputs=2:duration=first:normalize=0[audio]')
        else:
            filters.append('[music]anull[audio]')
    if filters:
        command += ['-filter_complex', ';'.join(filters)]
    command += ['-map', f'[{current}]' if current != '0:v' else '0:v']
    if music or audio:
        command += ['-map', '[audio]' if music else '[original]', '-c:a', 'aac']
    command += ['-t', str(duration), '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output]
    subprocess.run(command, capture_output=True, timeout=600, check=True)
