"""Real FFmpeg checks for the optional finishing controls."""
import shutil
import subprocess

import pytest

from media_effects import probe, render, resolve_source, foreground_height

pytestmark = pytest.mark.skipif(not shutil.which('ffmpeg'), reason='FFmpeg required')


def generate(*args):
    subprocess.run(['ffmpeg', '-y', '-v', 'error', *map(str, args)], check=True, timeout=30)


def test_blurred_bands_are_half_height():
    original_band = (1920 - 1080 * 9 / 16) / 2
    new_band = (1920 - foreground_height(1920, 1080)) / 2
    assert abs(new_band - original_band / 2) <= 1
    assert foreground_height(1080, 1920) == 1920


def test_retained_editor_input_is_accepted(tmp_path):
    edited = tmp_path / 'subtitled_123_clip.mp4'
    edited.touch()
    assert resolve_source(str(tmp_path), edited.name) == str(edited.resolve())


@pytest.mark.parametrize('filename', ['../other.mp4', r'..\other.mp4', 'C:other.mp4', 'clip.txt'])
def test_input_cannot_escape_job_directory(tmp_path, filename):
    with pytest.raises(ValueError):
        resolve_source(str(tmp_path), filename)


def test_missing_editor_input_is_reported(tmp_path):
    with pytest.raises(FileNotFoundError):
        resolve_source(str(tmp_path), 'missing.mp4')


@pytest.mark.parametrize('with_audio', [False, True])
def test_vertical_music_and_overlays(tmp_path, with_audio):
    source, music, image, output = [tmp_path / n for n in ['source.mp4', 'music.wav', 'image.png', 'output.mp4']]
    args = ['-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=10:d=1']
    if with_audio:
        args += ['-f', 'lavfi', '-i', 'sine=frequency=400:duration=1', '-c:a', 'aac']
    generate(*args, '-c:v', 'libx264', source)
    generate('-f', 'lavfi', '-i', 'sine=frequency=800:duration=0.3', music)
    generate('-f', 'lavfi', '-i', 'color=red:s=80x40', '-frames:v', '1', image)
    render(str(source), str(output), music=str(music), watermark=str(image),
           picture=str(image), blurred_vertical=True, original_volume=0, music_volume=.3)
    info = probe(str(output))
    video = next(s for s in info['streams'] if s['codec_type'] == 'video')
    assert (video['width'], video['height']) == (1080, 1920)
    assert any(s['codec_type'] == 'audio' for s in info['streams'])
    assert .9 <= float(info['format']['duration']) <= 1.2


def test_original_audio_volume_only(tmp_path):
    source, output = tmp_path / 'source.mp4', tmp_path / 'output.mp4'
    generate('-f', 'lavfi', '-i', 'color=blue:s=160x90:d=0.5',
             '-f', 'lavfi', '-i', 'sine=duration=0.5', '-c:v', 'libx264', '-c:a', 'aac', source)
    render(str(source), str(output), original_volume=0)
    result = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(output), '-map', '0:a',
                             '-f', 's16le', '-'], capture_output=True, check=True)
    assert result.stdout and set(result.stdout) == {0}
