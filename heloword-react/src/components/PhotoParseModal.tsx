import React, { useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { CustomWord, parsePhotoWords } from '../services/customVocab.service';

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
  onImport: (rows: ImportRow[]) => Promise<void>;
  lang?: string;
}

const COLUMNS: { key: keyof ParsedRow; label: string; required: boolean; width: string }[] = [
  { key: 'word',        label: 'word',        required: true,  width: 'min-w-[100px]' },
  { key: 'translateEn', label: 'translateEn',  required: true,  width: 'min-w-[140px]' },
  { key: 'translateCh', label: 'translateCh',  required: false, width: 'min-w-[100px]' },
  { key: 'sentence',    label: 'sentence',     required: false, width: 'min-w-[160px]' },
  { key: 'phonetics',   label: 'phonetics',    required: false, width: 'min-w-[100px]' },
];

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

const PhotoParseModal: React.FC<Props> = ({ onClose, onImport, lang = 'EN' }) => {
  const { t } = useTranslation();
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

  const handleSave = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      await onImport(
        validRows.map((r): ImportRow => ({
          word:        r.word.trim(),
          translateEn: r.translateEn.trim(),
          translateCh: r.translateCh.trim() || undefined,
          sentence:    r.sentence.trim()    || undefined,
          phonetics:   r.phonetics.trim()   || undefined,
        }))
      );
      onClose();
    } catch (e: any) {
      const msg =
        e?.message === 'WORD_LIMIT_EXCEEDED'
          ? t('userVocab.wordLimitReached')
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
        className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t('userVocab.photoImportTitle')}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Photo selection — shown when no rows yet and not parsing and not cropping */}
          {!cropFile && !parsing && rows.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('userVocab.photoImportHint')}
              </p>
              <div className="flex items-start gap-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl px-3 py-2.5">
                <svg className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <p className="text-xs text-yellow-700 dark:text-yellow-400">
                  {t('userVocab.photoParseLimit')}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => galleryRef.current?.click()}
                  className="flex-1 flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
                >
                  <svg className="w-9 h-9 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                    {t('userVocab.photoPickGallery')}
                  </span>
                </button>
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="flex-1 flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
                >
                  <svg className="w-9 h-9 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
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
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('userVocab.photoCropTitle')}
                </p>
                <button
                  onClick={() => setCropAspect(undefined)}
                  title="Free-form crop (or press F)"
                  className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
                    cropAspect === undefined
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  Free
                </button>
              </div>

              {/* Aspect ratio inputs with increment/decrement */}
              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Ratio:</span>

                {/* Width input */}
                <div className="flex items-center">
                  <button
                    onClick={decrementW}
                    className="p-1 rounded-l-lg border border-r-0 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 transition-colors"
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
                    className="w-12 px-2 py-1.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs text-center focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                  <button
                    onClick={incrementW}
                    className="p-1 rounded-r-lg border border-l-0 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>

                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">:</span>

                {/* Height input */}
                <div className="flex items-center">
                  <button
                    onClick={decrementH}
                    className="p-1 rounded-l-lg border border-r-0 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 transition-colors"
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
                    className="w-12 px-2 py-1.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs text-center focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                  <button
                    onClick={incrementH}
                    className="p-1 rounded-r-lg border border-l-0 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              </div>

              <div ref={cropperRef} className="relative w-full h-64 rounded-xl overflow-hidden bg-gray-900">
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
                <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  Press <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[10px] font-medium">F</kbd> for free-form
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
              <div className="w-8 h-8 border-[3px] border-purple-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('userVocab.photoAnalyzing')}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
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
                    className="text-xs text-purple-500 hover:text-purple-700 dark:hover:text-purple-300 font-medium"
                  >
                    {t('userVocab.photoReselect')}
                  </button>
                </div>
              )}

              {/* Stats row */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {t('userVocab.photoResults', { count: rows.length })}
                </p>
                <p className="text-xs text-gray-400">
                  {t('userVocab.importValid', { count: validRows.length })}
                  {rows.length > validRows.length && (
                    <span className="text-orange-400 ml-1">
                      ({t('userVocab.importSkipped', { count: rows.length - validRows.length })})
                    </span>
                  )}
                </p>
              </div>

              {/* Editable table */}
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      {COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          className={`px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap ${col.width}`}
                        >
                          {col.label}
                          {col.required && <span className="text-red-400 ml-0.5">*</span>}
                        </th>
                      ))}
                      <th className="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const isInvalid = !row.word.trim() || !row.translateEn.trim();
                      return (
                        <tr
                          key={idx}
                          className={`border-t border-gray-100 dark:border-gray-800 ${
                            isInvalid ? 'bg-red-50 dark:bg-red-900/10' : ''
                          }`}
                        >
                          {COLUMNS.map((col) => (
                            <td key={col.key} className="px-2 py-1.5">
                              <input
                                type="text"
                                value={row[col.key]}
                                onChange={(e) => updateRow(idx, col.key, e.target.value)}
                                className={`w-full px-2 py-1 rounded-lg border text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-400 ${
                                  col.required && !row[col.key].trim()
                                    ? 'border-red-300 dark:border-red-700'
                                    : 'border-gray-200 dark:border-gray-700'
                                }`}
                                placeholder={col.required ? col.label : '—'}
                              />
                            </td>
                          ))}
                          <td className="px-2 py-1.5">
                            <button
                              onClick={() => deleteRow(idx)}
                              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors"
                              aria-label="Delete row"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex gap-3">
          {cropFile && !parsing && rows.length === 0 ? (
            <>
              <button
                onClick={handleCropBack}
                className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {t('review.cancel')}
              </button>
              <button
                onClick={handleSkipCrop}
                className="flex-1 py-3 rounded-2xl border border-purple-300 dark:border-purple-700 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
              >
                {t('userVocab.photoCropSkip')}
              </button>
              <button
                onClick={handleCropConfirm}
                disabled={cropping}
                className="flex-1 py-3 rounded-2xl bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-white text-sm font-bold transition-colors"
              >
                {cropping ? '…' : t('userVocab.photoCropConfirm')}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {t('review.cancel')}
              </button>
              {rows.length > 0 && (
                <button
                  onClick={handleSave}
                  disabled={validRows.length === 0 || importing}
                  className="flex-1 py-3 rounded-2xl bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-white text-sm font-bold transition-colors"
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
