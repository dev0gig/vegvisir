'use strict'

const STORE_KEY = 'vegvisir.bookmarks'

// ---- State ---------------------------------------------------------------
/** @typedef {{id:string,name:string,url:string,folder:string,isFavorite:boolean,imageUrl?:string}} BM */

/** @returns {BM[]} */
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** @param {BM[]} list */
function save(list) {
  localStorage.setItem(STORE_KEY, JSON.stringify(list))
}

let editingId = null

// ---- Helpers -------------------------------------------------------------
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function faviconFor(url) {
  const host = hostOf(url)
  return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128` : ''
}

function firstUrlIn(text) {
  const m = (text || '').match(/https?:\/\/[^\s]+/)
  return m ? m[0] : ''
}

// ---- DOM refs ------------------------------------------------------------
const $ = (id) => document.getElementById(id)
const form = $('form')
const urlInput = $('url')
const nameInput = $('name')
const folderInput = $('folder')
const favInput = $('favorite')
const submitBtn = $('submit-btn')
const cancelEditBtn = $('cancel-edit')
const listEl = $('list')
const counterEl = $('counter')
const foldersDatalist = $('folders')

// ---- Render --------------------------------------------------------------
function render() {
  const list = load()
  counterEl.textContent = String(list.length)

  // folder suggestions
  const folders = [...new Set(list.map((b) => b.folder).filter(Boolean))].sort()
  foldersDatalist.innerHTML = folders.map((f) => `<option value="${escapeAttr(f)}"></option>`).join('')

  if (list.length === 0) {
    listEl.innerHTML = `<div class="empty">Noch keine Bookmarks. Füge oben eins hinzu –
      oder teile einen Link aus einer anderen App an Vegvisir.</div>`
    return
  }

  const sorted = [...list].sort((a, b) =>
    (a.folder || '￿').localeCompare(b.folder || '￿') || a.name.localeCompare(b.name),
  )

  listEl.innerHTML = sorted
    .map(
      (b) => `
    <div class="bm" data-id="${b.id}">
      <img class="fav" src="${escapeAttr(b.imageUrl || faviconFor(b.url))}" alt="" loading="lazy"
           onerror="this.style.visibility='hidden'" />
      <div class="meta">
        <div class="bm-name">
          ${b.isFavorite ? '<span class="star">★</span>' : ''}${escapeHtml(b.name || hostOf(b.url))}
          ${b.folder ? `<span class="badge">${escapeHtml(b.folder)}</span>` : ''}
        </div>
        <div class="bm-url">${escapeHtml(b.url)}</div>
      </div>
      <div class="row-actions">
        <button class="icon-btn edit" title="Bearbeiten" data-act="edit">✎</button>
        <button class="icon-btn del" title="Löschen" data-act="del">🗑</button>
      </div>
    </div>`,
    )
    .join('')
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;')
}

// ---- Add / Edit ----------------------------------------------------------
form.addEventListener('submit', (e) => {
  e.preventDefault()
  const url = urlInput.value.trim()
  if (!url) return
  const name = nameInput.value.trim() || hostOf(url) || url
  const folder = folderInput.value.trim()
  const isFavorite = favInput.checked

  const list = load()
  if (editingId) {
    const bm = list.find((b) => b.id === editingId)
    if (bm) Object.assign(bm, { name, url, folder, isFavorite })
    toast('Aktualisiert')
  } else {
    list.push({ id: uid(), name, url, folder, isFavorite })
    toast('Hinzugefügt')
  }
  save(list)
  resetForm()
  render()
})

// Auto-suggest name from URL while typing
urlInput.addEventListener('blur', () => {
  if (!nameInput.value.trim() && urlInput.value.trim()) {
    const h = hostOf(urlInput.value.trim())
    if (h) nameInput.placeholder = h
  }
})

cancelEditBtn.addEventListener('click', resetForm)

function resetForm() {
  editingId = null
  form.reset()
  submitBtn.textContent = 'Hinzufügen'
  cancelEditBtn.hidden = true
}

function startEdit(id) {
  const bm = load().find((b) => b.id === id)
  if (!bm) return
  editingId = id
  urlInput.value = bm.url
  nameInput.value = bm.name
  folderInput.value = bm.folder || ''
  favInput.checked = !!bm.isFavorite
  submitBtn.textContent = 'Speichern'
  cancelEditBtn.hidden = false
  urlInput.focus()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

listEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]')
  if (!btn) return
  const id = btn.closest('.bm')?.dataset.id
  if (!id) return
  if (btn.dataset.act === 'edit') startEdit(id)
  else if (btn.dataset.act === 'del') {
    save(load().filter((b) => b.id !== id))
    if (editingId === id) resetForm()
    render()
    toast('Gelöscht')
  }
})

// ---- Export (Toride-Format) ---------------------------------------------
function buildExport() {
  const list = load()
  const byFolder = new Map()
  const top = []
  for (const b of list) {
    const entry = { name: b.name || hostOf(b.url), url: b.url }
    const img = b.imageUrl || faviconFor(b.url)
    if (img) entry.imageUrl = img
    if (b.isFavorite) entry.isFavorite = true
    if (b.folder) {
      if (!byFolder.has(b.folder)) byFolder.set(b.folder, [])
      byFolder.get(b.folder).push(entry)
    } else {
      top.push(entry)
    }
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    folders: [...byFolder].map(([name, bookmarks]) => ({ name, icon: 'folder', bookmarks })),
    bookmarks: top,
  }
}

$('export-btn').addEventListener('click', () => {
  if (load().length === 0) return toast('Nichts zu exportieren')
  const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bookmarks-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  toast('Exportiert')
})

// ---- Import (eigenes Export-Format zurückladen / zusammenführen) ---------
$('import-btn').addEventListener('click', () => $('import-file').click())
$('import-file').addEventListener('change', (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result))
      mergeImport(data)
      render()
      toast('Geladen')
    } catch {
      toast('Ungültige JSON-Datei')
    }
    e.target.value = ''
  }
  reader.readAsText(file)
})

function mergeImport(data) {
  const list = load()
  const seen = new Set(list.map((b) => b.url))
  const add = (bm, folder) => {
    if (!bm?.url || seen.has(bm.url)) return
    seen.add(bm.url)
    list.push({
      id: uid(),
      name: bm.name || hostOf(bm.url),
      url: bm.url,
      folder: folder || '',
      isFavorite: !!bm.isFavorite,
      ...(bm.imageUrl ? { imageUrl: bm.imageUrl } : {}),
    })
  }
  for (const f of data.folders ?? []) for (const bm of f.bookmarks ?? []) add(bm, f.name)
  for (const bm of data.bookmarks ?? []) add(bm)
  save(list)
}

// ---- Clear ---------------------------------------------------------------
$('clear-btn').addEventListener('click', () => {
  if (load().length === 0) return
  if (confirm('Wirklich alle erfassten Bookmarks löschen?')) {
    save([])
    resetForm()
    render()
    toast('Geleert')
  }
})

// ---- Share target / query prefill ---------------------------------------
function handleSharedParams() {
  const p = new URLSearchParams(location.search)
  const sharedUrl = p.get('url') || firstUrlIn(p.get('text') || '') || firstUrlIn(p.get('title') || '')
  const sharedTitle = p.get('title') || ''
  if (sharedUrl) {
    urlInput.value = sharedUrl
    if (sharedTitle && !firstUrlIn(sharedTitle)) nameInput.value = sharedTitle
    nameInput.focus()
  }
  if (location.search) {
    history.replaceState(null, '', location.pathname)
  }
}

// ---- Toast ---------------------------------------------------------------
let toastTimer
function toast(msg) {
  const el = $('toast')
  el.textContent = msg
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (el.hidden = true), 1800)
}

// ---- Init ----------------------------------------------------------------
handleSharedParams()
render()

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
