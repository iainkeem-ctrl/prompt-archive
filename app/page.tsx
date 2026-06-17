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
  const [selected, setSelected] = useState<Entry | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const handleFilePick = (file: File) => {
    setPreviewFile(file);
    if (fileRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileRef.current.files = dt.files;
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFilePick(file);
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (!previewFile) {
      alert('이미지를 선택해주세요');
      return;
    }
    fd.set('image', previewFile);
    setUploading(true);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      form.reset();
      setPreviewFile(null);
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
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Prompt Archive</h1>
        <div className="flex items-center gap-3">
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
          <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3 space-y-3">
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
              <button onClick={() => { setShowUpload(false); setPreviewFile(null); }} className="text-zinc-500 hover:text-white text-lg leading-none">×</button>
            </div>
            <form ref={formRef} onSubmit={handleUpload} className="p-5 space-y-3">
              <div>
                <input ref={fileRef} name="image" type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFilePick(f); }} />
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
                <label className="text-xs text-zinc-500 block mb-1">Prompt *</label>
                <textarea name="prompt" required rows={3} placeholder="프롬프트 입력..." className="w-full bg-zinc-800 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none resize-none placeholder:text-zinc-600" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">모델 *</label>
                  <input name="model" required placeholder="Flux Dev, SDXL..." className="w-full bg-zinc-800 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none placeholder:text-zinc-600" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">카테고리</label>
                  <select name="category" className="w-full bg-zinc-800 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none">
                    <option value="etc">기타</option>
                    <option value="portrait">인물</option>
                    <option value="product">제품</option>
                    <option value="graphic">그래픽</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Negative Prompt</label>
                <input name="negative_prompt" placeholder="네거티브 프롬프트..." className="w-full bg-zinc-800 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none placeholder:text-zinc-600" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">ComfyUI Settings (JSON)</label>
                <textarea name="comfy_settings" rows={2} placeholder='{"steps": 20, "cfg": 7, ...}' className="w-full bg-zinc-800 text-sm text-zinc-400 rounded-lg px-3 py-2 outline-none resize-none placeholder:text-zinc-600 font-mono text-xs" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Notes</label>
                <input name="notes" placeholder="메모..." className="w-full bg-zinc-800 text-sm text-zinc-200 rounded-lg px-3 py-2 outline-none placeholder:text-zinc-600" />
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
            <div className="flex gap-4 p-5">
              <img
                src={selected.image_path}
                alt=""
                className="w-64 h-auto object-cover rounded-lg flex-shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-300">{selected.model}</span>
                  <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-300">{CATEGORY_LABEL[selected.category] ?? selected.category}</span>
                  <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-500">{new Date(selected.created_at).toLocaleDateString('ko-KR')}</span>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Prompt</p>
                  <p className="text-sm text-zinc-200 whitespace-pre-wrap">{selected.prompt}</p>
                </div>
                {selected.negative_prompt && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Negative</p>
                    <p className="text-sm text-zinc-400 whitespace-pre-wrap">{selected.negative_prompt}</p>
                  </div>
                )}
                {selected.comfy_settings && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">ComfyUI Settings</p>
                    <pre className="text-xs text-zinc-400 bg-zinc-800 p-3 rounded overflow-auto max-h-48">
                      {(() => { try { return JSON.stringify(JSON.parse(selected.comfy_settings!), null, 2); } catch { return selected.comfy_settings; } })()}
                    </pre>
                  </div>
                )}
                {selected.notes && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Notes</p>
                    <p className="text-sm text-zinc-400">{selected.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
