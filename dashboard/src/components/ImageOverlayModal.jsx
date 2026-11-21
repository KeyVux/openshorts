import { useEffect, useRef, useState } from 'react';
import Modal from './ui/Modal';
import { apiFetch } from '../lib/api';
import { getApiUrl } from '../config';

const labels = { watermark: 'Watermark', picture: 'Picture' };
const defaults = { watermark: { x: .78, y: .02, width: .18 }, picture: { x: .175, y: .66, width: .65 } };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export default function ImageOverlayModal({ jobId, index, filename, videoUrl, onClose, onApplied }) {
    const [images, setImages] = useState({});
    const [files, setFiles] = useState({});
    const [layout, setLayout] = useState(defaults);
    const [preview, setPreview] = useState(videoUrl);
    const [aspect, setAspect] = useState(9 / 16);
    const [blurred, setBlurred] = useState(false);
    const [sourceAspect, setSourceAspect] = useState(9 / 16);
    const [ratios, setRatios] = useState({});
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [editable, setEditable] = useState(false);
    const stage = useRef(null);
    const gesture = useRef(null);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await apiFetch(`/api/clip/media-state?job_id=${encodeURIComponent(jobId)}&input_filename=${encodeURIComponent(filename)}`);
                const data = await response.json();
                if (!response.ok) throw new Error(data.detail || 'Could not load image settings');
                if (cancelled) return;
                setImages(data.images || {});
                setLayout({ ...defaults, ...data.layout });
                setEditable(data.editable);
                setBlurred(data.blurred_vertical || false);
                if (data.blurred_vertical) setAspect(9 / 16);
                if (data.source_url) setPreview(getApiUrl(data.source_url));
            } catch (e) { if (!cancelled) setError(e.message); }
            finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, [jobId, filename]);
    const choose = (kind, file) => {
        if (!file) return;
        if (file.size > 30 * 1024 * 1024) { setError('Image exceeds 30 MB'); return; }
        const reader = new FileReader();
        reader.onload = () => {
            setImages(prev => ({ ...prev, [kind]: reader.result }));
            setFiles(prev => ({ ...prev, [kind]: file }));
            setError('');
        };
        reader.readAsDataURL(file);
    };
    const move = event => {
        const drag = gesture.current;
        if (!drag) return;
        const rect = stage.current.getBoundingClientRect();
        const dx = (event.clientX - drag.x) / rect.width;
        const dy = (event.clientY - drag.y) / rect.height;
        const ratio = ratios[drag.kind] || 1;
        const maxWidth = Math.min(1, ratio / aspect);
        const width = drag.resize ? clamp(drag.item.width + dx, .02, maxWidth) : Math.min(drag.item.width, maxWidth);
        const height = width * aspect / ratio;
        setLayout(prev => ({ ...prev, [drag.kind]: {
            width, x: clamp(drag.item.x + (drag.resize ? 0 : dx), 0, 1 - width),
            y: clamp(drag.item.y + (drag.resize ? 0 : dy), 0, Math.max(0, 1 - height)),
        } }));
    };
    const start = (event, kind, resize = false) => {
        event.preventDefault(); event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = { kind, resize, x: event.clientX, y: event.clientY, item: layout[kind] };
    };
    const apply = async () => {
        setBusy(true); setError('');
        try {
            const body = new FormData();
            Object.entries({ job_id: jobId, clip_index: index, input_filename: filename,
                images_only: 'true', image_layout: JSON.stringify(layout),
            }).forEach(([key, value]) => body.append(key, value));
            for (const kind of Object.keys(labels)) {
                body.append(`${kind}_mode`, images[kind] ? (files[kind] ? 'upload' : 'keep') : 'none');
                if (images[kind] && files[kind]) body.append(kind, files[kind]);
            }
            const response = await apiFetch('/api/clip/media', { method: 'POST', body });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'Could not render images');
            onApplied(data); onClose();
        } catch (e) { setError(e.message); }
        finally { setBusy(false); }
    };
    return <Modal isOpen onClose={busy ? undefined : onClose} title="Watermark & picture" size="lg">
        <p className="text-sm text-muted mb-3">Drag an image to move it. Drag its corner to resize. Changes apply when you render.</p>
        {!editable && !loading && <p className="text-xs text-muted mb-3">Existing images baked into older videos cannot be moved or removed. New images added here remain editable.</p>}
        {loading ? <p>Loading image settings…</p> : <>
            <div ref={stage} className="relative mx-auto bg-black overflow-hidden" style={{ aspectRatio: aspect, width: '100%', maxWidth: aspect < 1 ? 300 : 600, touchAction: 'none' }}
                onPointerMove={move} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }}>
                {blurred && <video src={preview} muted className="absolute w-full h-full object-cover blur-xl" />}
                <video src={preview} controls className={blurred ? 'absolute w-full object-cover' : 'w-full h-full'}
                    style={blurred ? { height: `${Math.floor((1920 + Math.min(1920, 1080 / sourceAspect)) / 4) * 2 / 1920 * 100}%`, top: '50%', transform: 'translateY(-50%)' } : undefined}
                    onLoadedMetadata={event => {
                        const ratio = event.currentTarget.videoWidth / event.currentTarget.videoHeight || 9 / 16;
                        setSourceAspect(ratio);
                        setAspect(blurred ? 9 / 16 : ratio);
                    }} />
                {!busy && Object.keys(labels).filter(kind => images[kind]).map(kind => <div key={kind}
                    className="absolute cursor-move border border-white" style={{ left: `${layout[kind].x * 100}%`, top: `${layout[kind].y * 100}%`, width: `${layout[kind].width * 100}%`, touchAction: 'none' }}
                    onPointerDown={event => start(event, kind)}>
                    <img src={images[kind]} alt={labels[kind]} draggable={false} className="w-full pointer-events-none" onLoad={event => {
                        const ratio = event.currentTarget.naturalWidth / event.currentTarget.naturalHeight;
                        setRatios(prev => ({ ...prev, [kind]: ratio }));
                        setLayout(prev => {
                            const width = Math.min(prev[kind].width, 1, ratio / aspect);
                            return { ...prev, [kind]: { width, x: clamp(prev[kind].x, 0, 1 - width), y: clamp(prev[kind].y, 0, Math.max(0, 1 - width * aspect / ratio)) } };
                        });
                    }} />
                    <button type="button" aria-label={`Resize ${labels[kind]}`} className="absolute -bottom-1 -right-1 w-4 h-4 bg-white border border-black cursor-nwse-resize" style={{ touchAction: 'none' }} onPointerDown={event => start(event, kind, true)} />
                </div>)}
            </div>
            <fieldset disabled={busy} className="space-y-3 mt-4">
                {Object.entries(labels).map(([kind, label]) => <div key={kind} className="space-y-1">
                    <label className="block text-sm">{label}<input className="block w-full" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => choose(kind, event.target.files[0])} /></label>
                    {images[kind] && <button type="button" className="text-sm underline" onClick={() => setImages(prev => ({ ...prev, [kind]: null }))}>Remove {label.toLowerCase()}</button>}
                </div>)}
            </fieldset>
        </>}
        {error && <p role="alert" className="text-red-500 text-sm mt-3">{error}</p>}
        <button type="button" disabled={busy || loading} className="btn-primary w-full mt-4" onClick={apply}>{busy ? 'Rendering images…' : 'Render changes'}</button>
    </Modal>;
}
