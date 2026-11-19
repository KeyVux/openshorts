import { useState } from 'react';
import Modal from './ui/Modal';

export default function MediaModal({ onClose, jobId, index, filename, onRender }) {
    const [modes, setModes] = useState({ music: 'none', watermark: 'none', picture: 'none' });
    const [files, setFiles] = useState({});
    const [queries, setQueries] = useState({});
    const [key, setKey] = useState('');
    const [musicVolume, setMusicVolume] = useState(20);
    const [originalVolume, setOriginalVolume] = useState(100);
    const [blurredVertical, setBlurredVertical] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const apply = (event) => {
        event.preventDefault();
        setBusy(true); setError('');
        try {
            const body = new FormData();
            Object.entries({ job_id: jobId, clip_index: index, input_filename: filename,
                music_volume: musicVolume / 100, original_volume: originalVolume / 100,
                pixabay_key: key, blurred_vertical: blurredVertical }).forEach(([name, value]) => body.append(name, value));
            for (const kind of Object.keys(modes)) {
                body.append(`${kind}_mode`, modes[kind]);
                if (modes[kind] === 'upload' && files[kind]) body.append(kind, files[kind]);
                if (queries[kind]) body.append(`${kind}_query`, queries[kind]);
            }
            onRender(body);
            onClose();
        } catch (e) { setError(e.message); }
        finally { setBusy(false); }
    };
    return <Modal isOpen onClose={busy ? undefined : onClose} title="music & images" size="lg">
        <form onSubmit={apply} className="space-y-5">
            <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={blurredVertical} disabled={busy} onChange={e => setBlurredVertical(e.target.checked)} />
                <span>Exact 9:16 (1080 × 1920), centered video with half-height blurred top and bottom areas (sides may be cropped)</span>
            </label>
            <p className="text-sm text-muted">Apply to the current clip. Watermark appears at the top right; the picture starts two-thirds down the frame. Applying again adds to the current video.</p>
            {Object.entries({ music: 'Background music', watermark: 'Watermark image', picture: 'Lower-third picture' }).map(([kind, label]) =>
                <fieldset key={kind} disabled={busy} className="space-y-2 border border-rule rounded-input p-3">
                    <legend className="text-sm">{label}</legend>
                    <label className="block text-sm">Source
                        <select className="block w-full bg-paper border border-rule rounded-input p-2" value={modes[kind]} onChange={e => setModes({ ...modes, [kind]: e.target.value })}>
                            <option value="none">None</option><option value="upload">Custom file</option>
                            <option value="api">{kind === 'music' ? 'Random from configured music API' : 'Random Pixabay image'}</option>
                        </select>
                    </label>
                    {modes[kind] === 'upload' && <label className="block text-sm">Choose file (maximum 30 MB)
                        <input className="block w-full" type="file" accept={kind === 'music' ? 'audio/*' : 'image/png,image/jpeg,image/webp'} required onChange={e => setFiles({ ...files, [kind]: e.target.files[0] })} />
                    </label>}
                    {modes[kind] === 'api' && kind !== 'music' && <label className="block text-sm">Image search
                        <input className="block w-full bg-paper border border-rule p-2" maxLength={100} value={queries[kind] || ''} onChange={e => setQueries({ ...queries, [kind]: e.target.value })} />
                    </label>}
                </fieldset>)}
            <p className="text-xs text-muted">Pixabay has no public music API. Upload a downloaded track, or ask your administrator to configure MUSIC_LIBRARY_API_URL.</p>
            {(modes.watermark === 'api' || modes.picture === 'api') && <>
                <label className="block text-sm">Pixabay API key (optional if configured on server)
                    <input type="password" autoComplete="off" className="block w-full bg-paper border border-rule p-2" value={key} onChange={e => setKey(e.target.value)} disabled={busy} />
                </label><a href="https://pixabay.com" target="_blank" rel="noreferrer" className="text-sm underline">Images provided by Pixabay</a>
            </>}
            {[['Music volume', musicVolume, setMusicVolume], ['Original audio volume', originalVolume, setOriginalVolume]].map(([label, value, setter]) =>
                <label key={label} className="block text-sm">{label}: {value}%
                    <input className="block w-full" type="range" min="0" max="200" value={value} disabled={busy} onChange={e => setter(Number(e.target.value))} />
                </label>)}
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full">Render in background</button>
        </form>
    </Modal>;
}
