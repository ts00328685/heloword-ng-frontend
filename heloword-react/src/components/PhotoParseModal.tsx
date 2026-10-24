import React, { useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import {
  batchAddCustomWords, createCustomGroup, CustomGroup, CustomWord, fetchCustomGroups, parsePhotoWords,
} from '../services/customVocab.service';
import { getWordFill } from '../services/llm.service';
import { aiErrorMessage } from '../utils/aiError';
import { stripReadings } from '../utils/wordLookup';

type ParsedRow = {
  word: string;
  translateEn: string;
  translateCh: string;
  sentence: string;
  phonetics: string;
};

type ImportRow = Omit<CustomWord, 'id' | 'groupId' | 'tableName' | 'language'>;

interface Props {
  onClose: () => void;
  /** Save into a fixed group (the group page). Omit to let the user pick a group (photo shortcut). */
  onImport?: (rows: ImportRow[]) => Promise<void>;
  lang?: string;
  /** Shortcut mode: called after saving, with the group the words went into. */
  onSaved?: (group: CustomGroup, count: number) => void;
}

const GROUP_LANGS = ['EN', 'JA', 'DE', 'Other'];
const LAST_GROUP_KEY = 'hw-photo-group';

/** Custom-group language → the word language the AI endpoints expect. */
function wordLangOf(groupLang: string): string {
  const l = groupLang.toUpperCase();
  if (l === 'JA' || l === 'JP') return 'jp';
  if (l === 'DE') return 'de';
  return 'en';
}

function readLastGroup(): number | null {
  try { return Number(localStorage.getItem(LAST_GROUP_KEY)) || null; } catch { return null; }
}

function compressImage(file: File, maxPx = 1600, quality = 0.82): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else                  { width  = Math.round(width  * maxPx / height); height = maxPx; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => blob
          ? resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
          : reject(new Error('compression failed')),
        'image/jpeg', quality
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;
      canvas.getContext('2d')!.drawImage(
        img, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
        0, 0, pixelCrop.width, pixelCrop.height
      );
      canvas.toBlob(
        (blob) => blob
          ? resolve(new File([blob], 'cropped.jpg', { type: 'image/jpeg' }))
          : reject(new Error('crop failed')),
        'image/jpeg', 0.92
      );
    };
    img.onerror = reject;
    img.src = imageSrc;
  });
}

const PhotoParseModal: React.FC<Props> = ({ onClose, onImport, lang: fixedLang = 'EN', onSaved }) => {
  const { t } = useTranslation();
  const pickGroup = !onImport;

  // ── Group picker (shortcut mode) ──
  const [groups, setGroups] = useState<CustomGroup[] | null>(null);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupLang, setNewGroupLang] = useState('JA');
  const [creatingGroup, setCreatingGroup] = useState(false);
  React.useEffect(() => {
    if (!pickGroup) return;
    fetchCustomGroups()
      .then((list) => {
        setGroups(list);
        const last = readLastGroup();
        setGroupId(list.find((g) => g.id === last)?.id ?? list[0]?.id ?? null);
      })
      .catch(() => setGroups([]));
  }, [pickGroup]);
  const group = groups?.find((g) => g.id === groupId) ?? null;
  const lang = pickGroup ? (group?.language ?? newGroupLang) : fixedLang;
  const choosingNewGroup = pickGroup && groups !== null && (groups.length === 0 || groupId === -1);

  // ── Per-row AI refill ──
  const [refilling, setRefilling] = useState<Set<number>>(new Set());
  const [openMore, setOpenMore] = useState<Set<number>>(new Set());
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [preview, setPreview] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropPreview, setCropPreview] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropping, setCropping] = useState(false);
  const [cropAspect, setCropAspect] = useState<number | undefined>(4 / 3);
  const [customAspectW, setCustomAspectW] = useState('4');
  const [customAspectH, setCustomAspectH] = useState('3');
  const cropperRef = useRef<HTMLDivElement>(null);

  const handlePhotoSelected = async (file: File) => {
    setError('');
    setRows([]);

    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setParsing(true);
    try {
      const compressed = await compressImage(file);
      const parsed = await parsePhotoWords(compressed, lang);
      if (parsed.length === 0) {
        setError(t('userVocab.photoNoWords'));
        return;
      }
      setRows(
        parsed.map((p) => ({
          word:        (p as any).word        ?? '',
          translateEn: (p as any).translateEn ?? '',
          translateCh: (p as any).translateCh ?? '',
          sentence:    (p as any).sentence    ?? '',
          phonetics:   (p as any).phonetics   ?? '',
        }))
      );
    } catch (e: any) {
      setError(e?.message || t('userVocab.photoParseError'));
    } finally {
      setParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError('');
    setRows([]);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropAspect(undefined);
    setCropFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setCropPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = async () => {
    if (!cropFile || !croppedAreaPixels || !cropPreview) return;
    setCropping(true);
    try {
      const cropped = await getCroppedImg(cropPreview, croppedAreaPixels);
      setCropFile(null);
      setCropPreview('');
      await handlePhotoSelected(cropped);
    } catch {
      setError(t('userVocab.photoParseError'));
    } finally {
      setCropping(false);
    }
  };

  const handleSkipCrop = async () => {
    if (!cropFile) return;
    const file = cropFile;
    setCropFile(null);
    setCropPreview('');
    await handlePhotoSelected(file);
  };

  const handleCropBack = () => {
    setCropFile(null);
    setCropPreview('');
    setError('');
  };

  const applyCustomAspect = (w?: string, h?: string) => {
    const width = w !== undefined ? parseFloat(w) : parseFloat(customAspectW);
    const height = h !== undefined ? parseFloat(h) : parseFloat(customAspectH);
    if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
      setCropAspect(width / height);
    }
  };

  const incrementW = () => {
    const newW = (parseFloat(customAspectW) || 1) + 1;
    setCustomAspectW(newW.toString());
    applyCustomAspect(newW.toString(), customAspectH);
  };

  const decrementW = () => {
    const newW = Math.max(1, (parseFloat(customAspectW) || 1) - 1);
    setCustomAspectW(newW.toString());
    applyCustomAspect(newW.toString(), customAspectH);
  };

  const incrementH = () => {
    const newH = (parseFloat(customAspectH) || 1) + 1;
    setCustomAspectH(newH.toString());
    applyCustomAspect(customAspectW, newH.toString());
  };

  const decrementH = () => {
    const newH = Math.max(1, (parseFloat(customAspectH) || 1) - 1);
    setCustomAspectH(newH.toString());
    applyCustomAspect(customAspectW, newH.toString());
  };

  React.useEffect(() => {
    applyCustomAspect();
  }, [customAspectW, customAspectH]);

  React.useEffect(() => {
    if (!cropFile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setCropAspect(undefined);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cropFile]);

  const updateRow = (idx: number, field: keyof ParsedRow, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const deleteRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const validRows = rows.filter((r) => r.word.trim() && r.translateEn.trim());

  /** Ask AI for fresh meanings (and a sentence if there is none) for one row. */
  const refillRow = async (idx: number) => {
    const word = rows[idx]?.word.trim();
    if (!word) return;
    setRefilling((s) => new Set(s).add(idx));
    try {
      const fill = await getWordFill(stripReadings(word).text || word, wordLangOf(lang));
      setRows((prev) => prev.map((r, i) => (i === idx ? {
        ...r,
        translateEn: fill.translateEn || r.translateEn,
        translateCh: fill.translateCh || r.translateCh,
        sentence: r.sentence.trim() ? r.sentence : (fill.sentence || ''),
      } : r)));
    } catch (e) {
      setError(aiErrorMessage(e, true));
    } finally {
      setRefilling((s) => { const n = new Set(s); n.delete(idx); return n; });
    }
  };

  const toggleMore = (idx: number) =>
    setOpenMore((s) => { const n = new Set(s); if (n.has(idx)) n.delete(idx); else n.add(idx); return n; });

  /** Shortcut mode: the chosen group, creating it first when "new group" is picked. */
  const ensureGroup = async (): Promise<CustomGroup> => {
    if (group) return group;
    const name = newGroupName.trim();
    if (!name) throw new Error(t('photoWords.groupNameRequired'));
    setCreatingGroup(true);
    try {
      const created = await createCustomGroup(name, '', newGroupLang);
      setGroups((g) => [created, ...(g ?? [])]);
      setGroupId(created.id);
      return created;
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleSave = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    setError('');
    const payload = validRows.map((r): ImportRow => ({
      word:        r.word.trim(),
      translateEn: r.translateEn.trim(),
      translateCh: r.translateCh.trim() || undefined,
      sentence:    r.sentence.trim()    || undefined,
      phonetics:   r.phonetics.trim()   || undefined,
    }));
    try {
      if (onImport) {
        await onImport(payload);
        onClose();
      } else {
        const target = await ensureGroup();
        const saved = await batchAddCustomWords(target.id, payload);
        try { localStorage.setItem(LAST_GROUP_KEY, String(target.id)); } catch {}
        onSaved?.(target, saved.length);
      }
    } catch (e: any) {
      const msg =
        e?.message === 'WORD_LIMIT_EXCEEDED'
          ? t('userVocab.wordLimitReached')
          : e?.message === 'GROUP_LIMIT_EXCEEDED'
            ? t('userVocab.groupLimitReached')
            : e?.message || t('userVocab.photoParseError');
      setError(msg);
    } finally {
      setImporting(false);
    }
  };

  const resetPhoto = () => {
    setRows([]);
    setPreview('');
    setError('');
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-t-3xl sm:rounded-3xl w-full sm:max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-line shrink-0">
          <h2 className="text-base font-semibold text-ink flex items-center gap-2">
            <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t('userVocab.photoImportTitle')}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-ink/5 transition-colors"
          >
            <svg className="w-5 h-5 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {pickGroup && !cropFile && !parsing && (
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <span className="text-xs text-ink-muted shrink-0">{t('photoWords.saveTo')}</span>
                {groups === null ? (
                  <span className="text-xs text-ink-faint animate-pulse">…</span>
                ) : (
                  <select
                    value={choosingNewGroup ? -1 : (groupId ?? -1)}
                    onChange={(e) => setGroupId(Number(e.target.value))}
                    className="flex-1 min-w-0 h-9 px-2 rounded-md border border-line bg-surface text-sm text-ink focus:outline-none focus:border-ink/40"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}（{g.language} · {g.wordCount}）</option>
                    ))}
                    <option value={-1}>{t('photoWords.newGroup')}</option>
                  </select>
                )}
              </label>
              {choosingNewGroup && (
                <div className="flex gap-2">
                  <input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder={t('photoWords.newGroupName')}
                    className="flex-1 min-w-0 h-9 px-3 rounded-md border border-line bg-surface text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-ink/40"
                  />
                  <select
                    value={newGroupLang}
                    onChange={(e) => setNewGroupLang(e.target.value)}
                    className="h-9 px-2 rounded-md border border-line bg-surface text-sm text-ink"
                  >
                    {GROUP_LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
          {/* Photo selection — shown when no rows yet and not parsing and not cropping */}
          {!cropFile && !parsing && rows.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-ink-muted">
                {t('userVocab.photoImportHint')}
              </p>
              <div className="flex items-start gap-2 bg-accent-soft rounded-xl px-3 py-2.5">
                <svg className="w-4 h-4 text-accent shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <p className="text-xs text-accent">
                  {t('userVocab.photoParseLimit')}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => galleryRef.current?.click()}
                  className="flex-1 flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 border-dashed border-line hover:border-accent transition-colors"
                >
                  <svg className="w-9 h-9 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm text-ink-muted font-medium">
                    {t('userVocab.photoPickGallery')}
                  </span>
                </button>
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="flex-1 flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 border-dashed border-line hover:border-accent transition-colors"
                >
                  <svg className="w-9 h-9 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm text-ink-muted font-medium">
                    {t('userVocab.photoTakePhoto')}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Hidden file inputs */}
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Crop UI */}
          {cropFile && !parsing && rows.length === 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">
                  {t('userVocab.photoCropTitle')}
                </p>
                <button
                  onClick={() => setCropAspect(undefined)}
                  title="Free-form crop (or press F)"
                  className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
                    cropAspect === undefined
                      ? 'bg-ink text-paper'
                      : 'bg-ink/10 text-ink-muted hover:bg-ink/20 '
                  }`}
                >
                  Free
                </button>
              </div>

              {/* Aspect ratio inputs with increment/decrement */}
              <div className="flex items-center gap-2 bg-paper rounded-lg p-2.5">
                <span className="text-xs font-medium text-ink-muted">Ratio:</span>

                {/* Width input */}
                <div className="flex items-center">
                  <button
                    onClick={decrementW}
                    className="p-1 rounded-l-lg border border-r-0 border-line bg-surface hover:bg-ink/5 text-ink-muted transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                  </button>
                  <input
                    id="customAspectW"
                    type="number"
                    value={customAspectW}
                    onChange={(e) => setCustomAspectW(e.target.value)}
                    placeholder="W"
                    className="w-12 px-2 py-1.5 border border-line bg-surface text-ink text-xs text-center focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button
                    onClick={incrementW}
                    className="p-1 rounded-r-lg border border-l-0 border-line bg-surface hover:bg-ink/5 text-ink-muted transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>

                <span className="text-xs font-medium text-ink-muted">:</span>

                {/* Height input */}
                <div className="flex items-center">
                  <button
                    onClick={decrementH}
                    className="p-1 rounded-l-lg border border-r-0 border-line bg-surface hover:bg-ink/5 text-ink-muted transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                  </button>
                  <input
                    id="customAspectH"
                    type="number"
                    value={customAspectH}
                    onChange={(e) => setCustomAspectH(e.target.value)}
                    placeholder="H"
                    className="w-12 px-2 py-1.5 border border-line bg-surface text-ink text-xs text-center focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button
                    onClick={incrementH}
                    className="p-1 rounded-r-lg border border-l-0 border-line bg-surface hover:bg-ink/5 text-ink-muted transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              </div>

              <div ref={cropperRef} className="relative w-full h-64 rounded-xl overflow-hidden bg-ink">
                <Cropper
                  image={cropPreview}
                  crop={crop}
                  zoom={zoom}
                  aspect={cropAspect}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, area) => setCroppedAreaPixels(area)}
                  showGrid={false}
                  restrictPosition={true}
                  minZoom={1}
                  maxZoom={10}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-purple-500"
                />
                <p className="text-xs text-ink-muted whitespace-nowrap">
                  Press <kbd className="px-1.5 py-0.5 bg-ink/10 rounded text-[10px] font-medium">F</kbd> for free-form
                </p>
              </div>
            </div>
          )}

          {/* Parsing state */}
          {parsing && (
            <div className="flex flex-col items-center gap-4 py-10">
              {preview && (
                <img
                  src={preview}
                  className="max-h-44 rounded-xl object-contain shadow-md"
                  alt="preview"
                />
              )}
              <div className="w-8 h-8 border-[3px] border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-ink-muted">
                {t('userVocab.photoAnalyzing')}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-danger-soft rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-danger shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          {/* Parsed results — editable table */}
          {rows.length > 0 && (
            <div className="space-y-3">
              {/* Photo thumbnail + re-select */}
              {preview && (
                <div className="flex items-center justify-between">
                  <img src={preview} className="h-10 rounded-lg object-contain" alt="photo" />
                  <button
                    onClick={resetPhoto}
                    className="text-xs text-accent hover:text-accent font-medium"
                  >
                    {t('userVocab.photoReselect')}
                  </button>
                </div>
              )}

              {/* Stats row */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                  {t('userVocab.photoResults', { count: rows.length })}
                </p>
                <p className="text-xs text-ink-faint">
                  {t('userVocab.importValid', { count: validRows.length })}
                  {rows.length > validRows.length && (
                    <span className="text-accent ml-1">
                      ({t('userVocab.importSkipped', { count: rows.length - validRows.length })})
                    </span>
                  )}
                </p>
              </div>

              <p className="text-[11px] text-ink-faint">{t('photoWords.editHint')}</p>
              <ul className="space-y-2">
                {rows.map((row, idx) => {
                  const missingEn = !row.translateEn.trim();
                  const busy = refilling.has(idx);
                  const field = (key: 'translateCh' | 'translateEn', label: string, required = false) => (
                    <label className="flex items-center gap-2">
                      <span className="w-7 shrink-0 text-[11px] text-ink-faint">{label}</span>
                      <input
                        type="text"
                        value={row[key]}
                        onChange={(e) => updateRow(idx, key, e.target.value)}
                        // Tap once to replace the whole meaning.
                        onFocus={(e) => e.currentTarget.select()}
                        disabled={busy}
                        placeholder={required ? t('photoWords.required') : '—'}
                        className={`flex-1 min-w-0 h-9 px-2.5 rounded-md border bg-surface text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-ink/40 disabled:opacity-50 ${
                          required && !row[key].trim() ? 'border-danger/40' : 'border-line'
                        }`}
                      />
                    </label>
                  );
                  return (
                    <li key={idx} className={`rounded-md border p-3 ${missingEn ? 'border-danger/30' : 'border-line'}`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={row.word}
                          onChange={(e) => updateRow(idx, 'word', e.target.value)}
                          placeholder={t('photoWords.word')}
                          className="flex-1 min-w-0 h-9 px-2.5 rounded-md border border-transparent hover:border-line focus:border-ink/40 bg-transparent text-base font-medium text-ink focus:outline-none"
                        />
                        <button
                          type="button"
                          data-analytics="photo_words.refill"
                          onClick={() => refillRow(idx)}
                          disabled={busy || !row.word.trim()}
                          className="shrink-0 h-8 px-2.5 rounded-md border border-line text-xs text-ink-muted hover:text-ink hover:border-ink/30 disabled:opacity-40 inline-flex items-center gap-1"
                        >
                          <svg className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                          {t('photoWords.refill')}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRow(idx)}
                          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-ink-faint hover:text-danger hover:bg-danger-soft transition-colors"
                          aria-label={t('photoWords.remove')}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {field('translateCh', '中')}
                        {field('translateEn', 'EN', true)}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleMore(idx)}
                        className="mt-2 text-[11px] text-ink-faint hover:text-ink transition-colors"
                      >
                        {openMore.has(idx) ? '−' : '+'} {t('photoWords.more')}
                      </button>
                      {openMore.has(idx) && (
                        <div className="mt-1.5 space-y-1.5">
                          <textarea
                            value={row.sentence}
                            onChange={(e) => updateRow(idx, 'sentence', e.target.value)}
                            rows={2}
                            placeholder={t('photoWords.sentence')}
                            className="w-full px-2.5 py-1.5 rounded-md border border-line bg-surface text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-ink/40 resize-none"
                          />
                          <input
                            type="text"
                            value={row.phonetics}
                            onChange={(e) => updateRow(idx, 'phonetics', e.target.value)}
                            placeholder={t('photoWords.phonetics')}
                            className="w-full h-9 px-2.5 rounded-md border border-line bg-surface text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-ink/40"
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-line flex gap-3">
          {cropFile && !parsing && rows.length === 0 ? (
            <>
              <button
                onClick={handleCropBack}
                className="flex-1 py-3 rounded-2xl border border-line text-sm font-medium text-ink-muted hover:bg-paper transition-colors"
              >
                {t('review.cancel')}
              </button>
              <button
                onClick={handleSkipCrop}
                className="flex-1 py-3 rounded-2xl border border-line text-sm font-medium text-accent hover:bg-accent-soft transition-colors"
              >
                {t('userVocab.photoCropSkip')}
              </button>
              <button
                onClick={handleCropConfirm}
                disabled={cropping}
                className="flex-1 py-3 rounded-2xl bg-ink hover:bg-ink/85 disabled:opacity-40 text-paper text-sm font-semibold transition-colors"
              >
                {cropping ? '…' : t('userVocab.photoCropConfirm')}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-2xl border border-line text-sm font-medium text-ink-muted hover:bg-paper transition-colors"
              >
                {t('review.cancel')}
              </button>
              {rows.length > 0 && (
                <button
                  onClick={handleSave}
                  disabled={validRows.length === 0 || importing || creatingGroup || (choosingNewGroup && !newGroupName.trim())}
                  className="flex-1 py-3 rounded-2xl bg-ink hover:bg-ink/85 disabled:opacity-40 text-paper text-sm font-semibold transition-colors"
                >
                  {importing ? '…' : t('userVocab.importConfirm', { count: validRows.length })}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PhotoParseModal;
