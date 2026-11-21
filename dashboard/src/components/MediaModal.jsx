import { useState } from 'react';
import Modal from './ui/Modal';

export default function MediaModal({ onClose, settings, onSave }) {
    const [modes, setModes] = useState(settings?.modes || { music: 'none', watermark: 'none', picture: 'none' });
    const [files, setFiles] = useState(settings?.files || {});
    const [queries, setQueries] = useState(settings?.queries || {});
    const [key, setKey] = useState(() => {
        if (settings?.key != null) return settings.key;
        try { return localStorage.getItem('os_pixabay_key') || ''; }
        catch { return ''; }
    });
    const [musicVolume, setMusicVolume] = useState(settings?.musicVolume ?? 20);
    const [originalVolume, setOriginalVolume] = useState(settings?.originalVolume ?? 100);
    const [blurredVertical, setBlurredVertical] = useState(settings?.blurredVertical || false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const apply = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setBusy(true); setError('');
        try {
            for (const [kind, mode] of Object.entries(modes)) {
                if (mode === 'upload' && !files[kind]) throw new Error(`Choose a ${kind} file`);
                if (mode === 'upload' && files[kind].size > 30 * 1024 * 1024) throw new Error('Asset exceeds 30 MB');
            }
            const savedKey = key.trim();
            try {
                if (savedKey) localStorage.setItem('os_pixabay_key', savedKey);
                else localStorage.removeItem('os_pixabay_key');
            } catch {
                throw new Error('Could not save the Pixabay API key. Allow browser storage and try again.');
            }
            onSave({ modes, files, queries, key: savedKey, musicVolume, originalVolume, blurredVertical });
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
            <p className="text-sm text-muted">Apply these settings to every video rendered in this working session. Watermark appears at the top right; the picture starts two-thirds down the frame.</p>
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
                        <input className="block w-full" type="file" accept={kind === 'music' ? 'audio/*' : 'image/png,image/jpeg,image/webp'} required={!files[kind]} onChange={e => setFiles({ ...files, [kind]: e.target.files[0] })} />
                    {files[kind] && <span className="text-xs text-muted">{files[kind].name}</span>}
                    </label>}
                    {modes[kind] === 'api' && kind !== 'music' && <label className="block text-sm">Image search
                        <input className="block w-full bg-paper border border-rule p-2" maxLength={100} value={queries[kind] || ''} onChange={e => setQueries({ ...queries, [kind]: e.target.value })} />
                    </label>}
                </fieldset>)}
            <p className="text-xs text-muted">Pixabay has no public music API. Upload a downloaded track, or ask your administrator to configure MUSIC_LIBRARY_API_URL.</p>
            {(modes.watermark === 'api' || modes.picture === 'api') && <>
                <label className="block text-sm">Pixabay API key (optional if configured on server)
                    <input type="password" autoComplete="off" className="block w-full bg-paper border border-rule p-2" value={key} onChange={e => setKey(e.target.value)} disabled={busy} />
                </label>
                <p className="text-xs text-muted">Saved in this browser across sessions when you save settings. Clear the key and save to remove it.</p>
                <a href="https://pixabay.com" target="_blank" rel="noreferrer" className="text-sm underline">Images provided by Pixabay</a>
            </>}
            {[['Music volume', musicVolume, setMusicVolume], ['Original audio volume', originalVolume, setOriginalVolume]].map(([label, value, setter]) =>
                <label key={label} className="block text-sm">{label}: {value}%
                    <input className="block w-full" type="range" min="0" max="200" value={value} disabled={busy} onChange={e => setter(Number(e.target.value))} />
                </label>)}
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full">Save session settings</button>
        </form>
    </Modal>;
}
