'use client';

import { useEffect, useState, useRef } from 'react';

type Entry = {
  id: string;
  image_path: string;
  prompt: string;
  negative_prompt: string;
  model: string;
  category: string;
  comfy_settings: string | null;
  notes: string;
  created_at: string;
};

const CATEGORIES = ['all', 'portrait', 'product', 'graphic', 'etc'];
const SORTS = [{ value: 'newest', label: '최신순' }, { value: 'oldest', label: '오래된순' }];
const CATEGORY_LABEL: Record<string, string> = {
  portrait: '인물', product: '제품', graphic: '그래픽', etc: '기타', all: '전체'
};

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [filterModel, setFilterModel] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [sort, setSort] = useState('newest');
  const [columns, setColumns] = useState(4);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Entry>>({});

  const startEdit = () => { setEditing(true); setEditForm({ ...selected }); };

  const saveEdit = async () => {
    if (!selected) return;
    const res = await fetch(`/api/entries/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    const updated = await res.json();
    setSelected(updated);
    setEditing(false);
    fetchEntries();
  };

  const deleteEntry = async () => {
    if (!selected) return;
    if (!confirm('삭제할까요?')) return;
    await fetch(`/api/entries/${selected.id}`, { method: 'DELETE' });
    setSelected(null);
    fetchEntries();
  };
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [comfyJson, setComfyJson] = useState('');
  const [uploadForm, setUploadForm] = useState({ prompt: '', model: '', negative_prompt: '', category: 'etc', notes: '' });
  type BatchLog = { name: string; status: 'pending' | 'done' | 'duplicate' | 'error' };
  const [batchProgress, setBatchProgress] = useState<{ total: number; done: number; current: string; log: BatchLog[] } | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const [bulkCategory, setBulkCategory] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ prompt: string; negative_prompt: string } | null>(null);
  const [refImage, setRefImage] = useState<{ file: File; dataUrl: string } | null>(null);
  const [genInstruction, setGenInstruction] = useState('');
  const [showGenModal, setShowGenModal] = useState(false);
  const [genTab, setGenTab] = useState<'reference' | 'avatar'>('reference');
  const AVATAR_MULTI_KEYS = ['skin_detail', 'pose', 'style'];
  const [avatar, setAvatar] = useState<Record<string, string | string[]>>({ gender: '', ethnicity: '', age: '', face_shape: '', skin_tone: '', skin_detail: [] as string[], eyes_shape: '', eyes_color: '', nose: '', lips: '', hair_style: '', hair_color: '', expression: '', shot: '', pose: [] as string[], background: '', lighting: '', style: [] as string[], extra: '' });
  const setAv = (k: string, v: string) => setAvatar(a => {
    if (AVATAR_MULTI_KEYS.includes(k)) {
      const arr = (a[k] as string[]);
      return { ...a, [k]: arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v] };
    }
    return { ...a, [k]: v === a[k] ? '' : v };
  });
  const isAvSelected = (k: string, v: string) => AVATAR_MULTI_KEYS.includes(k) ? (avatar[k] as string[]).includes(v) : avatar[k] === v;

  const toggleCheck = (id: string) => setCheckedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const onMainMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-entry-id]')) return;
    if (e.button !== 0) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    setDragRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
  };

  const onMainMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const sx = dragStart.current.x, sy = dragStart.current.y;
    setDragRect({
      x: Math.min(sx, e.clientX), y: Math.min(sy, e.clientY),
      w: Math.abs(e.clientX - sx), h: Math.abs(e.clientY - sy),
    });
  };

  const onMainMouseUp = () => {
    if (!dragStart.current || !dragRect) { dragStart.current = null; setDragRect(null); return; }
    if (dragRect.w > 5 || dragRect.h > 5) {
      const cards = document.querySelectorAll<HTMLElement>('[data-entry-id]');
      const sel = new Set(checkedIds);
      cards.forEach(card => {
        const r = card.getBoundingClientRect();
        const overlaps = r.left < dragRect.x + dragRect.w && r.right > dragRect.x &&
                         r.top < dragRect.y + dragRect.h && r.bottom > dragRect.y;
        if (overlaps) sel.add(card.dataset.entryId!);
      });
      if (sel.size > 0) setSelectMode(true);
      setCheckedIds(sel);
    }
    dragStart.current = null;
    setDragRect(null);
  };

  const bulkDelete = async () => {
    if (!confirm(`${checkedIds.size}개 삭제할까요?`)) return;
    await Promise.all([...checkedIds].map(id => fetch(`/api/entries/${id}`, { method: 'DELETE' })));
    setCheckedIds(new Set());
    setSelectMode(false);
    fetchEntries();
  };

  const bulkChangeCategory = async () => {
    if (!bulkCategory) return;
    await Promise.all([...checkedIds].map(id =>
      fetch(`/api/entries/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: bulkCategory }) })
    ));
    setCheckedIds(new Set());
    setSelectMode(false);
    fetchEntries();
  };

  type DupGroup = { key_prompt: string; filename?: string; ids: string[]; image_paths: string[]; models: string[]; dates: string[]; cnt: number };
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [dupGroups, setDupGroups] = useState<DupGroup[]>([]);
  const [dupLoading, setDupLoading] = useState(false);
  const [keepIds, setKeepIds] = useState<Record<string, string>>({}); // groupIdx -> id to keep
  const [pagedragOver, setPageDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const uploadOriginalFile = useRef<File | null>(null);

  const extractPngMeta = (file: File): Promise<{ workflow?: string; prompt?: string }> =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const buf = new Uint8Array(e.target!.result as ArrayBuffer);
          const dec = new TextDecoder('latin1');
          const result: { workflow?: string; prompt?: string } = {};
          let i = 8; // skip PNG signature
          while (i < buf.length - 12) {
            const len = (buf[i] << 24) | (buf[i+1] << 16) | (buf[i+2] << 8) | buf[i+3];
            const type = dec.decode(buf.slice(i+4, i+8));
            if (type === 'tEXt' || type === 'iTXt') {
              const data = dec.decode(buf.slice(i+8, i+8+len));
              const nullIdx = data.indexOf('\0');
              if (nullIdx !== -1) {
                const key = data.slice(0, nullIdx).toLowerCase();
                const val = data.slice(nullIdx + 1).replace(/^\0+/, '');
                if (key === 'workflow') result.workflow = val;
                if (key === 'prompt') result.prompt = val;
              }
            }
            if (type === 'IEND') break;
            i += 12 + len;
          }
          resolve(result);
        } catch { resolve({}); }
      };
      reader.readAsArrayBuffer(file);
    });

  type NodeLike = { class_type?: string; inputs?: Record<string, unknown>; type?: string; widgets_values?: unknown[] };

  const parseComfyNodes = (nodes: NodeLike[]) => {
    let positive = '', negative = '', model = '';
    const ksampler: Record<string, unknown> = {};
    // workflow format: nodes array with type + widgets_values
    for (const node of nodes) {
      const type = node.type ?? node.class_type ?? '';
      const widgets = node.widgets_values ?? [];
      const inputs = node.inputs ?? {};
      if (type === 'CLIPTextEncode' || type === 'Text Multiline') {
        const text = (typeof inputs.text === 'string' ? inputs.text : null) ?? (typeof widgets[0] === 'string' ? widgets[0] : null);
        if (typeof text === 'string' && text.trim()) {
          if (!positive) positive = text;
          else if (!negative) negative = text;
        }
      } else if (type === 'UNETLoader' || type === 'CheckpointLoaderSimple') {
        const name = inputs.unet_name ?? inputs.ckpt_name ?? widgets[0];
        if (typeof name === 'string') model = name;
      } else if (type === 'KSampler') {
        const keys = ['seed', 'steps', 'cfg', 'sampler_name', 'scheduler', 'denoise'];
        keys.forEach((k, i) => {
          const v = inputs[k] ?? widgets[i];
          if (v !== undefined) ksampler[k] = v;
        });
      }
    }
    return { positive, negative, model, ksampler };
  };

  const parseComfyInfo = (json: Record<string, unknown>) => {
    // workflow format: has top-level "nodes" array
    if (Array.isArray(json.nodes)) {
      return parseComfyNodes(json.nodes as NodeLike[]);
    }
    // prompt API format: flat object where each value has class_type
    const nodes = Object.values(json) as NodeLike[];
    if (nodes.some(n => n && typeof n === 'object' && 'class_type' in n)) {
      return parseComfyNodes(nodes);
    }
    return { positive: '', negative: '', model: '', ksampler: {} };
  };

  const hashFile = async (file: File): Promise<string> => {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const compressImage = (file: File): Promise<File> =>
    new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_PX = 2000;
        const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => {
          if (!blob) { resolve(file); return; }
          const name = file.name.replace(/\.[^.]+$/, '.jpg');
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.82);
      };
      img.src = url;
    });

  const handleFilePick = async (file: File) => {
    uploadOriginalFile.current = file;
    const compressed = await compressImage(file);
    setPreviewFile(compressed);
    if (fileRef.current) {
      const dt = new DataTransfer();
      dt.items.add(compressed);
      fileRef.current.files = dt.files;
    }
    if (file.name.endsWith('.png')) {
      const meta = await extractPngMeta(file);
      // prefer prompt (API format) for info extraction, fall back to workflow
      for (const raw of [meta.prompt, meta.workflow]) {
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          const { positive, negative, model, ksampler } = parseComfyInfo(parsed);
          if (positive || model) {
            setUploadForm(f => ({
              ...f,
              prompt: positive || f.prompt,
              negative_prompt: negative || f.negative_prompt,
              model: model || f.model,
            }));
            setComfyJson(Object.keys(ksampler).length > 0 ? JSON.stringify(ksampler, null, 2) : JSON.stringify(parsed, null, 2));
            break;
          }
        } catch { /* ignore */ }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(file.name))) handleFilePick(file);
  };

  const uploadFileDirect = async (file: File): Promise<'ok' | 'duplicate'> => {
    const [compressed, fileHash] = await Promise.all([compressImage(file), hashFile(file)]);
    let positive = '', negative = '', model = '', ksamplerStr = '';
    if (file.name.endsWith('.png')) {
      const meta = await extractPngMeta(file);
      for (const raw of [meta.prompt, meta.workflow]) {
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          const info = parseComfyInfo(parsed);
          if (info.positive || info.model) {
            positive = info.positive; negative = info.negative;
            model = info.model;
            ksamplerStr = Object.keys(info.ksampler).length > 0 ? JSON.stringify(info.ksampler) : '';
            break;
          }
        } catch { /* ignore */ }
      }
    }
    const fd = new FormData();
    fd.set('image', compressed);
    fd.set('prompt', positive || '(no prompt)');
    fd.set('model', model || 'unknown');
    fd.set('negative_prompt', negative);
    fd.set('category', 'etc');
    fd.set('comfy_settings', ksamplerStr);
    fd.set('notes', '');
    fd.set('file_hash', fileHash);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (res.status === 409) return 'duplicate';
    if (!res.ok) throw new Error(await res.text());
    return 'ok';
  };

  const handleBatchDrop = async (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif)$/i.test(f.name));
    if (images.length === 0) return;
    if (images.length === 1) { setShowUpload(true); handleFilePick(images[0]); return; }
    type LogItem = { name: string; status: 'pending' | 'done' | 'duplicate' | 'error' };
    const log: LogItem[] = images.map(f => ({ name: f.name, status: 'pending' }));
    setBatchProgress({ total: images.length, done: 0, current: images[0].name, log });
    for (let i = 0; i < images.length; i++) {
      setBatchProgress(p => p ? { ...p, done: i, current: images[i].name } : p);
      try {
        const result = await uploadFileDirect(images[i]);
        log[i] = { name: log[i].name, status: result === 'duplicate' ? 'duplicate' : 'done' };
      } catch {
        log[i] = { name: log[i].name, status: 'error' };
      }
      setBatchProgress(p => p ? { ...p, done: i + 1, log: [...log] } : p);
    }
    fetchEntries();
    setTimeout(() => setBatchProgress(null), 2000);
  };

  const resetUploadModal = () => {
    setPreviewFile(null);
    setComfyJson('');
    setUploadForm({ prompt: '', model: '', negative_prompt: '', category: 'etc', notes: '' });
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!previewFile) { alert('이미지를 선택해주세요'); return; }
    const originalForHash = uploadOriginalFile.current ?? previewFile;
    const fileHash = await hashFile(originalForHash);
    const fd = new FormData();
    fd.set('image', previewFile);
    fd.set('prompt', uploadForm.prompt);
    fd.set('model', uploadForm.model);
    fd.set('negative_prompt', uploadForm.negative_prompt);
    fd.set('category', uploadForm.category);
    fd.set('notes', uploadForm.notes);
    fd.set('comfy_settings', comfyJson);
    fd.set('file_hash', fileHash);
    setUploading(true);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (res.status === 409) {
        const { existing } = await res.json();
        const ok = confirm(`⚠️ 중복 이미지 감지\n\n이미 동일한 파일이 등록되어 있어요.\n모델: ${existing.model}\n\n그래도 업로드할까요?`);
        if (!ok) { setUploading(false); return; }
        fd.delete('file_hash');
        const res2 = await fetch('/api/upload', { method: 'POST', body: fd });
        if (!res2.ok) throw new Error(await res2.text());
        resetUploadModal(); setShowUpload(false); await fetchEntries();
        setUploading(false); return;
      }
      if (!res.ok) throw new Error(await res.text());
      resetUploadModal();
      setShowUpload(false);
      await fetchEntries();
    } catch (err) {
      alert('업로드 실패: ' + err);
    } finally {
      setUploading(false);
    }
  };

  const generatePrompt = async (mode: 'reference' | 'avatar' = 'reference') => {
    setGenerating(true);
    setGenResult(null);
    try {
      let body: Record<string, unknown>;
      if (mode === 'avatar') {
        body = { mode: 'avatar', avatar };
      } else if (refImage) {
        const base64 = refImage.dataUrl.split(',')[1];
        const mediaType = refImage.file.type || 'image/jpeg';
        body = { mode: 'ref_image', refImageBase64: base64, refMediaType: mediaType, instruction: genInstruction };
      } else {
        body = { mode: 'reference', instruction: genInstruction };
      }
      const res = await fetch('/api/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGenResult({ prompt: data.prompt, negative_prompt: data.negative_prompt });
    } catch (e) {
      alert('생성 실패: ' + e);
    } finally {
      setGenerating(false);
    }
  };

  const openDuplicates = async () => {
    setShowDuplicates(true);
    setDupLoading(true);
    try {
      const res = await fetch('/api/duplicates');
      if (!res.ok) throw new Error(await res.text());
      const data: DupGroup[] = await res.json();
      setDupGroups(data);
      const defaults: Record<string, string> = {};
      data.forEach((g, i) => { defaults[String(i)] = g.ids[0]; });
      setKeepIds(defaults);
    } catch (e) {
      alert('오류: ' + e);
      setShowDuplicates(false);
    } finally {
      setDupLoading(false);
    }
  };

  const deleteDuplicates = async () => {
    const toDelete: string[] = [];
    dupGroups.forEach((g, i) => {
      const keep = keepIds[String(i)] ?? g.ids[0];
      g.ids.forEach(id => { if (id !== keep) toDelete.push(id); });
    });
    if (toDelete.length === 0) return;
    if (!confirm(`${toDelete.length}개 항목을 삭제할까요?`)) return;
    await Promise.all(toDelete.map(id => fetch(`/api/entries/${id}`, { method: 'DELETE' })));
    setShowDuplicates(false);
    fetchEntries();
  };

  const fetchEntries = async () => {
    const params = new URLSearchParams();
    if (filterModel) params.set('model', filterModel);
    if (filterCategory !== 'all') params.set('category', filterCategory);
    params.set('sort', sort);
    const res = await fetch(`/api/entries?${params}`);
    const data: Entry[] = await res.json();
    setEntries(data);
    setModels([...new Set(data.map(e => e.model))]);
  };

  useEffect(() => { fetchEntries(); }, [filterModel, filterCategory, sort]);

  return (
    <div
      className={`min-h-screen bg-zinc-950 text-white relative ${pagedragOver ? 'ring-2 ring-inset ring-white/30' : ''}`}
      onDragOver={e => { e.preventDefault(); setPageDragOver(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPageDragOver(false); }}
      onDrop={e => { e.preventDefault(); setPageDragOver(false); const files = Array.from(e.dataTransfer.files); console.log('dropped files count:', files.length, files.map(f => f.name)); handleBatchDrop(files); }}
    >
    {pagedragOver && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 pointer-events-none">
        <div className="text-white text-2xl font-semibold">이미지를 여기에 놓으세요</div>
      </div>
    )}
    {batchProgress && (
      <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 border border-zinc-700 rounded-xl px-5 py-4 shadow-xl w-72">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-zinc-300">배치 업로드</span>
          <span className="text-xs text-zinc-500">{batchProgress.done}/{batchProgress.total}</span>
        </div>
        <div className="w-full bg-zinc-700 rounded-full h-1 mb-3">
          <div className="bg-white h-1 rounded-full transition-all duration-300" style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }} />
        </div>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {batchProgress.log.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm flex-shrink-0">
                {item.status === 'done' ? '✓' : item.status === 'duplicate' ? '⊟' : item.status === 'error' ? '✗' : '·'}
              </span>
              <span className={`text-xs truncate ${item.status === 'done' ? 'text-zinc-400' : item.status === 'duplicate' ? 'text-yellow-500' : item.status === 'error' ? 'text-red-400' : 'text-zinc-200'}`}>
                {item.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    )}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => { setFilterModel(''); setFilterCategory('all'); setSort('newest'); setSelectMode(false); setCheckedIds(new Set()); }}>Prompt Archive</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600">⊟</span>
            <input
              type="range" min={2} max={8} value={columns}
              onChange={e => setColumns(Number(e.target.value))}
              className="w-20 accent-white"
            />
            <span className="text-xs text-zinc-600">⊞</span>
          </div>
          <span className="text-zinc-500 text-sm">{entries.length} entries</span>
          <button
            onClick={() => { setShowGenModal(true); setGenResult(null); setGenTab('reference'); setRefImage(null); }}
            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-full hover:bg-indigo-500 transition-colors"
          >
            ✦ 프롬프트 생성
          </button>
          <button
            onClick={() => { setSelectMode(v => !v); setCheckedIds(new Set()); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${selectMode ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
          >
            {selectMode ? '취소' : '선택'}
          </button>
          <button
            onClick={openDuplicates}
            className="px-3 py-1.5 bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-full hover:bg-zinc-700 transition-colors"
          >
            중복 관리
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="px-3 py-1.5 bg-white text-black text-xs font-semibold rounded-full hover:bg-zinc-200 transition-colors"
          >
            + 업로드
          </button>
        </div>
      </header>

      <div className="px-6 py-3 border-b border-zinc-800 flex gap-3 flex-wrap items-center">
        <div className="flex gap-1">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setFilterCategory(c)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filterCategory === c ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {CATEGORY_LABEL[c] ?? c}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-zinc-700" />
        <select
          value={filterModel}
          onChange={e => setFilterModel(e.target.value)}
          className="bg-zinc-800 text-zinc-300 text-xs px-3 py-1 rounded-full border border-zinc-700 outline-none"
        >
          <option value="">모든 모델</option>
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="bg-zinc-800 text-zinc-300 text-xs px-3 py-1 rounded-full border border-zinc-700 outline-none"
        >
          {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <main
        ref={mainRef}
        className="p-6 relative"
        onMouseDown={onMainMouseDown}
        onMouseMove={onMainMouseMove}
        onMouseUp={onMainMouseUp}
        onMouseLeave={onMainMouseUp}
        style={{ userSelect: dragRect ? 'none' : undefined }}
      >
        {dragRect && dragRect.w > 2 && (
          <div className="fixed pointer-events-none z-40 border border-white/60 bg-white/10 rounded"
            style={{ left: dragRect.x, top: dragRect.y, width: dragRect.w, height: dragRect.h }} />
        )}
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-600">
            <p className="text-lg">아직 아카이브가 없어요</p>
            <p className="text-sm mt-1">이미지를 업로드해서 시작하세요</p>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {entries.map(entry => {
              const checked = checkedIds.has(entry.id);
              return (
                <div
                  key={entry.id}
                  data-entry-id={entry.id}
                  onClick={() => selectMode ? toggleCheck(entry.id) : setSelected(entry)}
                  className={`cursor-pointer group rounded-lg overflow-hidden bg-zinc-900 transition-all ${selectMode && checked ? 'ring-2 ring-white' : ''}`}
                >
                  <div className="relative aspect-square">
                    <img
                      src={entry.image_path}
                      alt={entry.prompt.slice(0, 40)}
                      className={`w-full h-full object-cover transition-opacity ${selectMode && !checked ? 'opacity-60' : 'group-hover:opacity-80'}`}
                    />
                    {selectMode && (
                      <div className="absolute top-2 left-2">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${checked ? 'bg-white border-white' : 'border-zinc-400 bg-black/40'}`}>
                          {checked && <span className="text-black text-xs font-bold">✓</span>}
                        </div>
                      </div>
                    )}
                    {!selectMode && (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                        <p className="text-xs text-zinc-300 line-clamp-2">{entry.prompt}</p>
                      </div>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <span className="text-xs text-zinc-400 font-medium">{entry.model}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showUpload && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowUpload(false)}>
          <div className="bg-zinc-900 rounded-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 className="font-semibold text-sm">업로드</h2>
              <button onClick={() => { setShowUpload(false); resetUploadModal(); }} className="text-zinc-500 hover:text-white text-lg leading-none">×</button>
            </div>
            <form ref={formRef} onSubmit={handleUpload} className="p-5 space-y-3">
              <div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFilePick(f); }} />
                <div
                  onClick={() => fileRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  className={`w-full h-32 rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${
                    dragOver ? 'border-white bg-zinc-800' : 'border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  {previewFile ? (
                    <div className="flex flex-col items-center gap-1">
                      <img src={URL.createObjectURL(previewFile)} className="h-20 object-contain rounded" />
                      <span className="text-xs text-zinc-500">{previewFile.name}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-zinc-500">
                      <span className="text-2xl">↑</span>
                      <span className="text-xs">이미지를 드래그하거나 클릭해서 선택</span>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">
                  Prompt *
                  {uploadForm.prompt && <span className="ml-2 text-green-500">✓ 자동 감지됨</span>}
                </label>
                <textarea required rows={3} placeholder="프롬프트 입력..." value={uploadForm.prompt} onChange={e => setUploadForm(f => ({...f, prompt: e.target.value}))} className="w-full bg-zinc-800 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none resize-none placeholder:text-zinc-600" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">
                    모델 *
                    {uploadForm.model && <span className="ml-2 text-green-500">✓</span>}
                  </label>
                  <input required placeholder="Flux Dev, SDXL..." value={uploadForm.model} onChange={e => setUploadForm(f => ({...f, model: e.target.value}))} className="w-full bg-zinc-800 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none placeholder:text-zinc-600" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">카테고리</label>
                  <select value={uploadForm.category} onChange={e => setUploadForm(f => ({...f, category: e.target.value}))} className="w-full bg-zinc-800 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none">
                    <option value="etc">기타</option>
                    <option value="portrait">인물</option>
                    <option value="product">제품</option>
                    <option value="graphic">그래픽</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Negative Prompt</label>
                <input placeholder="네거티브 프롬프트..." value={uploadForm.negative_prompt} onChange={e => setUploadForm(f => ({...f, negative_prompt: e.target.value}))} className="w-full bg-zinc-800 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none placeholder:text-zinc-600" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">
                  ComfyUI Settings (JSON)
                  {comfyJson && <span className="ml-2 text-green-500">✓ 자동 감지됨</span>}
                </label>
                <textarea
                  rows={2}
                  value={comfyJson}
                  onChange={e => setComfyJson(e.target.value)}
                  placeholder='{"steps": 20, "cfg": 7, ...}'
                  className="w-full bg-zinc-800 text-sm text-zinc-400 rounded-lg px-3 py-2 outline-none resize-none placeholder:text-zinc-600 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Notes</label>
                <input placeholder="메모..." value={uploadForm.notes} onChange={e => setUploadForm(f => ({...f, notes: e.target.value}))} className="w-full bg-zinc-800 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none placeholder:text-zinc-600" />
              </div>
              <button type="submit" disabled={uploading} className="w-full py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50">
                {uploading ? '업로드 중...' : '저장'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showGenModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => !generating && setShowGenModal(false)}>
          <div className="bg-zinc-900 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
              <div className="flex gap-1">
                <button onClick={() => { setGenTab('reference'); setGenResult(null); }} className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${genTab === 'reference' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>레퍼런스 기반</button>
                <button onClick={() => { setGenTab('avatar'); setGenResult(null); }} className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${genTab === 'avatar' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>아바타 빌더</button>
              </div>
              {!generating && <button onClick={() => setShowGenModal(false)} className="text-zinc-500 hover:text-white text-lg">×</button>}
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">

              {genTab === 'reference' && !genResult && !generating && (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-500">레퍼런스 사진을 업로드하면 아카이브 프롬프트 노하우를 참고해 비슷한 인물 프롬프트를 생성합니다.</p>
                  <div
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={async e => {
                      e.preventDefault();
                      e.stopPropagation();
                      const f = e.dataTransfer.files[0];
                      if (!f || !f.type.startsWith('image/')) return;
                      const compressed = await compressImage(f);
                      const reader = new FileReader();
                      reader.onload = ev => setRefImage({ file: compressed, dataUrl: ev.target!.result as string });
                      reader.readAsDataURL(compressed);
                    }}
                    className="relative border-2 border-dashed border-zinc-700 rounded-xl overflow-hidden cursor-pointer hover:border-zinc-500 transition-colors"
                    style={{ minHeight: refImage ? 'auto' : '120px' }}
                    onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = async (ev) => { const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return; const compressed = await compressImage(f); const reader = new FileReader(); reader.onload = e2 => setRefImage({ file: compressed, dataUrl: e2.target!.result as string }); reader.readAsDataURL(compressed); }; inp.click(); }}
                  >
                    {refImage ? (
                      <div className="relative">
                        <img src={refImage.dataUrl} alt="ref" className="w-full max-h-64 object-contain bg-zinc-900" />
                        <button onClick={e => { e.stopPropagation(); setRefImage(null); }} className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center hover:bg-black">×</button>
                        <p className="text-xs text-zinc-500 text-center py-1 bg-zinc-900">{refImage.file.name}</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-28 gap-1.5">
                        <span className="text-2xl text-zinc-600">↑</span>
                        <p className="text-xs text-zinc-500">클릭하거나 이미지를 드래그해서 업로드</p>
                      </div>
                    )}
                  </div>
                  <input value={genInstruction} onChange={e => setGenInstruction(e.target.value)} placeholder="추가 요청사항 (예: 더 밝은 조명, 야외 배경...)" className="w-full bg-zinc-800 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none placeholder:text-zinc-600" />
                  <button onClick={() => generatePrompt('reference')} className="w-full py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-500">✦ 생성하기</button>
                </div>
              )}

              {genTab === 'avatar' && !genResult && !generating && (
                <div className="space-y-4">
                  <p className="text-xs text-zinc-500">인물 특성을 선택하면 아카이브 스타일로 프롬프트를 생성합니다. 선택 안 해도 됩니다.</p>
                  <div>
                    <p className="text-xs text-zinc-500 mb-1.5">나이대</p>
                    <input type="number" min={1} max={99} value={avatar.age as string} onChange={e => setAvatar(a => ({ ...a, age: e.target.value }))} placeholder="예: 25" className="w-24 bg-zinc-800 text-sm text-zinc-200 rounded-lg px-3 py-1.5 outline-none placeholder:text-zinc-600" />
                  </div>
                  {([
                    { key: 'gender', label: '성별', options: ['여성', '남성'] },
                    { key: 'ethnicity', label: '인종', options: ['한국인', '동아시아', '동남아시아', '남아시아', '백인', '흑인', '히스패닉', '중동', '혼혈'] },
                    { key: 'face_shape', label: '얼굴형', options: ['계란형', '둥근형', '각진형', '하트형', '긴형', '다이아몬드형'] },
                    { key: 'skin_tone', label: '피부톤', options: ['백옥', '아이보리', '베이지', '웜 베이지', '올리브', '탠', '카라멜', '다크브라운'] },
                    { key: 'skin_detail', label: '피부 특징 (복수선택)', options: ['클린 스킨', '주근깨', '뷰티마크', '자연 포어', '글로우 스킨', '매트 스킨', '데우이 스킨'] },
                    { key: 'eyes_shape', label: '눈 모양', options: ['아몬드형', '라운드형', '올라간 눈꼬리', '내려간 눈꼬리', '외꺼풀', '쌍꺼풀', '고양이눈', '순한 눈'] },
                    { key: 'eyes_color', label: '눈 색', options: ['블랙', '다크브라운', '브라운', '헤이즐', '그린', '블루', '그레이'] },
                    { key: 'nose', label: '코', options: ['오똑한 코', '작은 코', '자연스러운', '작고 오똑한', '넓고 자연스러운', '좁고 긴'] },
                    { key: 'lips', label: '입술', options: ['풍성한 입술', '얇은 입술', '쿠피드 보우', '라운드형', '자연스러운', '작고 도톰한', '넓고 얇은'] },
                    { key: 'hair_style', label: '헤어스타일', options: ['긴 스트레이트', '긴 웨이브', '중단발', '단발 보브', '숏 보브', '픽시컷', '업스타일 번', '포니테일', '사이드스윕', '센터파트'] },
                    { key: 'hair_color', label: '헤어컬러', options: ['블랙', '다크브라운', '미디엄브라운', '오번', '블론드', '플래티넘 블론드', '레드', '그레이', '실버', '하이라이트'] },
                    { key: 'expression', label: '표정', options: ['무표정', '자연스러운 미소', '환한 미소', '자신감 있는', '우아한', '강렬한'] },
                    { key: 'shot', label: '구도', options: ['클로즈업 페이스', '헤드샷', '상반신', '3/4 앵글', '프로필(측면)', '풀바디'] },
                    { key: 'pose', label: '자세 (복수선택)', options: ['정면', '살짝 돌아봄', '어깨 드롭', '손 얼굴 근처', '팔짱', '손 허리', '기댄 자세', '앉은 자세', '뒤돌아봄', '걷는 자세'] },
                    { key: 'background', label: '배경', options: ['화이트 호리존', '블랙 시임리스', '그레이 그라디언트', '소프트 베이지', '자연/야외', '도시 거리', '스튜디오 웜', '스튜디오 쿨', '보케 블러', '미니멀 컬러'] },
                    { key: 'lighting', label: '조명', options: ['하이키 에벤 라이트', '소프트 박스', '자연광 윈도우', '골든아워', '림라이트', '버터플라이', '렘브란트', '드라마틱 사이드'] },
                    { key: 'style', label: '스타일/무드 (복수선택)', options: ['K-뷰티 에디토리얼', '하이패션', '자연스러운 미니멀', '커머셜 뷰티', '럭셔리', '스트릿', '프로페셔널'] },
                  ] as { key: string; label: string; options: string[] }[]).map(({ key, label, options }) => (
                    <div key={key}>
                      <p className="text-xs text-zinc-500 mb-1.5">{label}</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {options.map(opt => (
                          <button key={opt} onClick={() => setAv(key, opt)}
                            className={`px-2.5 py-1 rounded-full text-xs transition-colors ${isAvSelected(key, opt) ? 'bg-white text-black font-semibold' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div>
                    <p className="text-xs text-zinc-500 mb-1.5">추가 요청</p>
                    <input value={avatar.extra} onChange={e => setAvatar(a => ({...a, extra: e.target.value}))} placeholder="자유 입력 (예: 귀걸이 착용, 터틀넥 의상...)" className="w-full bg-zinc-800 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none placeholder:text-zinc-600" />
                  </div>
                  <button onClick={() => generatePrompt('avatar')} className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-500">✦ 아바타 프롬프트 생성</button>
                </div>
              )}

              {generating && (
                <div className="flex items-center gap-3 text-zinc-400 py-12 justify-center">
                  <div className="w-4 h-4 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                  <span className="text-sm">아카이브 분석 중...</span>
                </div>
              )}

              {genResult && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-zinc-500 font-medium">Prompt</label>
                      <button onClick={() => navigator.clipboard.writeText(genResult.prompt)} className="text-xs text-zinc-500 hover:text-white px-2 py-0.5 bg-zinc-800 rounded">복사</button>
                    </div>
                    <textarea readOnly value={genResult.prompt} rows={8} className="w-full bg-zinc-800 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none resize-none" />
                  </div>
                  {genResult.negative_prompt && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-zinc-500 font-medium">Negative Prompt</label>
                        <button onClick={() => navigator.clipboard.writeText(genResult.negative_prompt)} className="text-xs text-zinc-500 hover:text-white px-2 py-0.5 bg-zinc-800 rounded">복사</button>
                      </div>
                      <textarea readOnly value={genResult.negative_prompt} rows={3} className="w-full bg-zinc-800 text-sm text-zinc-400 rounded-lg px-3 py-2 outline-none resize-none" />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setGenResult(null)} className="flex-1 py-2 bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-lg hover:bg-zinc-700">← 돌아가기</button>
                    <button onClick={() => generatePrompt(genTab)} disabled={generating} className="flex-1 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-500 disabled:opacity-50">재생성</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectMode && checkedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-4">
          <span className="text-sm text-zinc-300 font-medium">{checkedIds.size}개 선택됨</span>
          <div className="flex items-center gap-2">
            <select
              value={bulkCategory}
              onChange={e => setBulkCategory(e.target.value)}
              className="bg-zinc-800 text-zinc-200 text-xs px-3 py-1.5 rounded-full border border-zinc-700 outline-none"
            >
              <option value="">분류 변경...</option>
              <option value="portrait">인물</option>
              <option value="product">제품</option>
              <option value="graphic">그래픽</option>
              <option value="etc">기타</option>
            </select>
            <button
              onClick={bulkChangeCategory}
              disabled={!bulkCategory}
              className="px-3 py-1.5 bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-full hover:bg-zinc-600 disabled:opacity-40 transition-colors"
            >
              적용
            </button>
          </div>
          <div className="w-px h-5 bg-zinc-700" />
          <button onClick={() => generatePrompt('reference')} disabled={generating} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-full hover:bg-indigo-500 disabled:opacity-50 transition-colors">
            ✦ 프롬프트 생성
          </button>
          <div className="w-px h-5 bg-zinc-700" />
          <button onClick={bulkDelete} className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-full hover:bg-red-500 transition-colors">
            삭제
          </button>
          <button onClick={() => { setCheckedIds(new Set()); setSelectMode(false); }} className="text-zinc-500 hover:text-white text-sm">
            취소
          </button>
        </div>
      )}

      {showDuplicates && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowDuplicates(false)}>
          <div className="bg-zinc-900 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
              <div>
                <h2 className="font-semibold text-sm">중복 이미지 관리</h2>
                {!dupLoading && <p className="text-xs text-zinc-500 mt-0.5">{dupGroups.length}개 그룹 발견 · 남길 이미지를 선택하세요</p>}
              </div>
              <div className="flex gap-2">
                {!dupLoading && dupGroups.length > 0 && (
                  <button onClick={deleteDuplicates} className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-full hover:bg-red-500">
                    선택 제외 삭제
                  </button>
                )}
                <button onClick={() => setShowDuplicates(false)} className="text-zinc-500 hover:text-white text-lg leading-none">×</button>
              </div>
            </div>
            <div className="overflow-y-auto p-5 space-y-6">
              {dupLoading && <div className="text-zinc-500 text-sm text-center py-10">찾는 중...</div>}
              {!dupLoading && dupGroups.length === 0 && <div className="text-zinc-500 text-sm text-center py-10">중복 없음 👍</div>}
              {dupGroups.map((group, gi) => (
                <div key={gi} className="border border-zinc-800 rounded-lg p-4">
                  {group.filename && <p className="text-xs text-zinc-400 font-medium mb-1">📄 {group.filename}</p>}
                  <p className="text-xs text-zinc-500 mb-3 line-clamp-2">{group.key_prompt}</p>
                  <div className="flex gap-3 flex-wrap">
                    {group.ids.map((id, ii) => {
                      const isKeep = (keepIds[String(gi)] ?? group.ids[0]) === id;
                      return (
                        <div
                          key={id}
                          onClick={() => setKeepIds(k => ({ ...k, [String(gi)]: id }))}
                          className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${isKeep ? 'border-white' : 'border-zinc-700 opacity-50 hover:opacity-80'}`}
                          style={{ width: 120 }}
                        >
                          <img src={group.image_paths[ii]} className="w-full h-20 object-cover" />
                          <div className="px-2 py-1 bg-zinc-800">
                            <p className="text-xs text-zinc-400 truncate">{group.models[ii]}</p>
                            <p className="text-xs text-zinc-600">{new Date(group.dates[ii]).toLocaleDateString('ko-KR')}</p>
                          </div>
                          {isKeep && <div className="text-center text-xs bg-white text-black py-0.5 font-semibold">유지</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-zinc-900 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
              <div className="flex gap-2">
                {!editing ? (
                  <button onClick={startEdit} className="px-3 py-1 bg-zinc-800 text-zinc-300 text-xs rounded-full hover:bg-zinc-700">수정</button>
                ) : (
                  <>
                    <button onClick={saveEdit} className="px-3 py-1 bg-white text-black text-xs rounded-full font-semibold">저장</button>
                    <button onClick={() => setEditing(false)} className="px-3 py-1 bg-zinc-800 text-zinc-300 text-xs rounded-full">취소</button>
                  </>
                )}
                <button onClick={deleteEntry} className="px-3 py-1 bg-zinc-800 text-red-400 text-xs rounded-full hover:bg-zinc-700">삭제</button>
              </div>
              <button onClick={() => { setSelected(null); setEditing(false); }} className="text-zinc-500 hover:text-white text-lg leading-none">×</button>
            </div>
            <div className="flex flex-col gap-4 p-5">
              <img src={selected.image_path} alt="" className="w-full max-h-[60vh] object-contain rounded-lg bg-zinc-800" />
              <div className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  {editing ? (
                    <>
                      <input value={editForm.model ?? ''} onChange={e => setEditForm(f => ({...f, model: e.target.value}))} className="bg-zinc-800 text-zinc-200 text-xs px-2 py-0.5 rounded outline-none w-32" />
                      <select value={editForm.category ?? 'etc'} onChange={e => setEditForm(f => ({...f, category: e.target.value}))} className="bg-zinc-800 text-zinc-200 text-xs px-2 py-0.5 rounded outline-none">
                        {CATEGORIES.filter(c => c !== 'all').map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                      </select>
                    </>
                  ) : (
                    <>
                      <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-300">{selected.model}</span>
                      <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-300">{CATEGORY_LABEL[selected.category] ?? selected.category}</span>
                      <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-500">{new Date(selected.created_at).toLocaleDateString('ko-KR')}</span>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Prompt</p>
                  {editing ? (
                    <textarea value={editForm.prompt ?? ''} onChange={e => setEditForm(f => ({...f, prompt: e.target.value}))} rows={4} className="w-full bg-zinc-800 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none resize-none" />
                  ) : (
                    <p className="text-sm text-zinc-200 whitespace-pre-wrap">{selected.prompt}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Negative</p>
                  {editing ? (
                    <textarea value={editForm.negative_prompt ?? ''} onChange={e => setEditForm(f => ({...f, negative_prompt: e.target.value}))} rows={2} className="w-full bg-zinc-800 text-sm text-zinc-400 rounded-lg px-3 py-2 outline-none resize-none" />
                  ) : (
                    selected.negative_prompt && <p className="text-sm text-zinc-400 whitespace-pre-wrap">{selected.negative_prompt}</p>
                  )}
                </div>
                {selected.comfy_settings && !editing && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">ComfyUI Settings</p>
                    <pre className="text-xs text-zinc-400 bg-zinc-800 p-3 rounded overflow-auto max-h-48">
                      {(() => { try { return JSON.stringify(JSON.parse(selected.comfy_settings!), null, 2); } catch { return selected.comfy_settings; } })()}
                    </pre>
                  </div>
                )}
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Notes</p>
                  {editing ? (
                    <input value={editForm.notes ?? ''} onChange={e => setEditForm(f => ({...f, notes: e.target.value}))} className="w-full bg-zinc-800 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none" />
                  ) : (
                    selected.notes && <p className="text-sm text-zinc-400">{selected.notes}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
