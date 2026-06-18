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
  const [batchProgress, setBatchProgress] = useState<{ total: number; done: number; current: string; log: {name: string; status: 'pending'|'done'|'error'}[] } | null>(null);
  const [pagedragOver, setPageDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

  const uploadFileDirect = async (file: File) => {
    const compressed = await compressImage(file);
    let positive = '', negative = '', model = '', ksamplerStr = '';
    if (file.name.endsWith('.png')) {
      const meta = await extractPngMeta(file);
      for (const raw of [meta.prompt, meta.workflow]) {
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          const info = parseComfyInfo(parsed);
          if (info.positive || info.model) {
            positive = info.positive;
            negative = info.negative;
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
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(await res.text());
  };

  const handleBatchDrop = async (files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif)$/i.test(f.name));
    if (images.length === 0) return;
    if (images.length === 1) { setShowUpload(true); handleFilePick(images[0]); return; }
    const log = images.map(f => ({ name: f.name, status: 'pending' as const }));
    setBatchProgress({ total: images.length, done: 0, current: images[0].name, log });
    for (let i = 0; i < images.length; i++) {
      const updatedLog = [...log];
      setBatchProgress(p => p ? { ...p, done: i, current: images[i].name } : p);
      try {
        await uploadFileDirect(images[i]);
        updatedLog[i] = { ...updatedLog[i], status: 'done' };
      } catch {
        updatedLog[i] = { ...updatedLog[i], status: 'error' };
      }
      log[i] = updatedLog[i];
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
    const fd = new FormData();
    fd.set('image', previewFile);
    fd.set('prompt', uploadForm.prompt);
    fd.set('model', uploadForm.model);
    fd.set('negative_prompt', uploadForm.negative_prompt);
    fd.set('category', uploadForm.category);
    fd.set('notes', uploadForm.notes);
    fd.set('comfy_settings', comfyJson);
    setUploading(true);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
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
                {item.status === 'done' ? '✓' : item.status === 'error' ? '✗' : '·'}
              </span>
              <span className={`text-xs truncate ${item.status === 'done' ? 'text-zinc-400' : item.status === 'error' ? 'text-red-400' : 'text-zinc-200'}`}>
                {item.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    )}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Prompt Archive</h1>
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

      <main className="p-6">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-600">
            <p className="text-lg">아직 아카이브가 없어요</p>
            <p className="text-sm mt-1">이미지를 업로드해서 시작하세요</p>
          </div>
        ) : (
          <div className="gap-3 space-y-3" style={{ columns }}>
            {entries.map(entry => (
              <div
                key={entry.id}
                onClick={() => setSelected(entry)}
                className="break-inside-avoid cursor-pointer group rounded-lg overflow-hidden bg-zinc-900"
              >
                <div className="relative">
                  <img
                    src={entry.image_path}
                    alt={entry.prompt.slice(0, 40)}
                    className="w-full object-cover group-hover:opacity-80 transition-opacity"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <p className="text-xs text-zinc-300 line-clamp-2">{entry.prompt}</p>
                  </div>
                </div>
                <div className="px-2 py-1.5">
                  <span className="text-xs text-zinc-400 font-medium">{entry.model}</span>
                </div>
              </div>
            ))}
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
            <div className="flex gap-4 p-5">
              <img src={selected.image_path} alt="" className="w-64 h-auto object-cover rounded-lg flex-shrink-0" />
              <div className="flex-1 min-w-0 space-y-3">
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
