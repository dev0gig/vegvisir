// ------------------------------------------------------------
// 1. HELFER: IndexedDB / LocalStorage
// ------------------------------------------------------------
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('ScryfallCacheV3', 3);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('sets')) {
                db.createObjectStore('sets', { keyPath: 'code' });
            }
            if (!db.objectStoreNames.contains('setLoadStatus')) {
                db.createObjectStore('setLoadStatus', { keyPath: 'code' });
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function getCachedSet(setCode) {
    const db = await openDB();
    const tx = db.transaction('sets', 'readonly');
    const store = tx.objectStore('sets');
    return new Promise((resolve) => {
        const req = store.get(setCode);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
    });
}

async function cacheSet(setCode, data) {
    const db = await openDB();
    const tx = db.transaction('sets', 'readwrite');
    const store = tx.objectStore('sets');
    store.put({ code: setCode, data, timestamp: Date.now() });
    return new Promise((resolve) => { tx.oncomplete = resolve; });
}

async function getLoadStatus(setCode) {
    const db = await openDB();
    const tx = db.transaction('setLoadStatus', 'readonly');
    const store = tx.objectStore('setLoadStatus');
    return new Promise((resolve) => {
        const req = store.get(setCode);
        req.onsuccess = () => resolve(req.result || { enLoaded: false, deLoaded: false, enCount: 0, deCount: 0 });
        req.onerror = () => resolve({ enLoaded: false, deLoaded: false, enCount: 0, deCount: 0 });
    });
}

async function setLoadStatus(setCode, status) {
    const db = await openDB();
    const tx = db.transaction('setLoadStatus', 'readwrite');
    const store = tx.objectStore('setLoadStatus');
    store.put({ code: setCode, ...status, timestamp: Date.now() });
    return new Promise((resolve) => { tx.oncomplete = resolve; });
}

function getCachedIcon(setCode) {
    return localStorage.getItem('icon_' + setCode);
}

function cacheIcon(setCode, svgUrl) {
    localStorage.setItem('icon_' + setCode, svgUrl);
}

// ------------------------------------------------------------
// 2. STATE + PERSISTENZ
// ------------------------------------------------------------
const STORAGE_KEY = 'alteSets_myCards';

function loadMyCards() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) { /* ignore */ }
    return [];
}

function saveMyCards(cards) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    document.getElementById('storageInfo').textContent =
        `gespeichert (${cards.length} Karten)`;
}

const state = {
    allSets: [],
    filteredSets: [],
    selectedSetCode: null,
    currentCards: [],        // Englische Karten (Hauptliste)
    germanCardsMap: new Map(), // Map: oracle_id -> germanName
    myCards: loadMyCards(),
    searchQuery: '',
    loadStatuses: new Map(),
};

// DOM-Refs
const $setGrid = document.getElementById('setGrid');
const $setSearch = document.getElementById('setSearch');
const $cardSearch = document.getElementById('cardSearch');
const $searchBtn = document.getElementById('searchBtn');
const $suggestions = document.getElementById('suggestionsContainer');
const $cardList = document.getElementById('cardList');
const $cardCount = document.getElementById('cardCount');
const $exportArea = document.getElementById('exportArea');
const $status = document.getElementById('statusMsg');
const $clearBtn = document.getElementById('clearBtn');
const $exportBtn = document.getElementById('exportBtn');
const $storageInfo = document.getElementById('storageInfo');
const $setCounter = document.getElementById('setCounter');
const $overallProgress = document.getElementById('overallProgress');

// ------------------------------------------------------------
// 3. DEUTSCHE NAMEN AUS API-DATEN EXTRAHIEREN
// ------------------------------------------------------------
function extractGermanName(card) {
    // Wenn die Karte selbst Deutsch ist
    if (card.lang === 'de') {
        return card.printed_name || card.name;
    }
    // Wenn printed_name existiert und vom englischen Namen abweicht
    if (card.printed_name && card.printed_name !== card.name) {
        return card.printed_name;
    }
    return null;
}

// ------------------------------------------------------------
// 4. SETS LADEN & FILTERN (ALLE VOR M15)
// ------------------------------------------------------------
async function loadAllSets() {
    $status.innerText = '📡 Lade Sets von Scryfall …';
    try {
        const resp = await fetch('https://api.scryfall.com/sets');
        if (!resp.ok) throw new Error('Fehler beim Laden der Sets');
        const json = await resp.json();

        const thresholdDate = new Date('2014-07-18');

        let all = json.data.filter(s => s.card_count > 0 && s.icon_svg_uri && s.released_at);

        state.filteredSets = all.filter(s => {
            const releaseDate = new Date(s.released_at);
            return releaseDate < thresholdDate;
        });

        state.filteredSets.sort((a, b) => {
            const da = new Date(a.released_at);
            const db = new Date(b.released_at);
            return da - db;
        });

        state.allSets = state.filteredSets;

        for (const s of state.filteredSets) {
            if (!getCachedIcon(s.code)) {
                cacheIcon(s.code, s.icon_svg_uri);
            }
        }

        for (const s of state.filteredSets) {
            const status = await getLoadStatus(s.code);
            state.loadStatuses.set(s.code, status);
        }

        renderSetGrid(state.filteredSets);
        updateOverallProgress();
        $setCounter.textContent = `${state.filteredSets.length} Sets geladen (vor M15)`;
        $status.innerText = `✅ ${state.filteredSets.length} alte Sets geladen. Wähle ein Set aus.`;

        renderCardList();
        updateExport();
        $storageInfo.textContent = `gespeichert (${state.myCards.length} Karten)`;

    } catch (err) {
        $status.innerText = '❌ Fehler: ' + err.message;
        console.error(err);
    }
}

function updateOverallProgress() {
    let completeCount = 0;
    const total = state.allSets.length;
    for (const s of state.allSets) {
        const st = state.loadStatuses.get(s.code);
        if (st && st.enLoaded && st.deLoaded) {
            completeCount++;
        }
    }
    $overallProgress.textContent = `${completeCount}/${total} Sets komplett (EN+DE)`;
}

// ------------------------------------------------------------
// 5. SET-GRID RENDER (mit Ladebalken)
// ------------------------------------------------------------
function renderSetGrid(sets) {
    if (!sets || sets.length === 0) {
        $setGrid.innerHTML = '<div class="no-results">🔍 Kein Set gefunden.</div>';
        return;
    }
    let html = '';
    for (const s of sets) {
        const icon = getCachedIcon(s.code) || s.icon_svg_uri;
        const selected = state.selectedSetCode === s.code ? 'selected' : '';
        const name = s.name || s.code.toUpperCase();
        const year = s.released_at ? new Date(s.released_at).getFullYear() : '';
        const loadStatus = state.loadStatuses.get(s.code) || { enLoaded: false, deLoaded: false, enCount: 0, deCount: 0 };
        const enClass = loadStatus.enLoaded ? 'en-loaded' : '';
        const deClass = loadStatus.deLoaded ? 'de-loaded' : '';
        const statusText = (loadStatus.enLoaded && loadStatus.deLoaded) ? '✓ EN+DE' :
            loadStatus.enLoaded ? '✓ EN' : loadStatus.deLoaded ? '✓ DE' : '—';

        html += `
            <div class="set-icon-item ${selected}" data-code="${s.code}" data-name="${s.name}">
                <img src="${icon}" alt="${s.code}" loading="lazy" />
                <span class="set-code">${s.code.toUpperCase()}</span>
                <span class="set-name">${name} ${year ? "'" + String(year).slice(-2) : ''}</span>
                <div class="load-indicator">
                    <span class="${enClass}" title="EN: ${loadStatus.enCount} Karten"></span>
                    <span class="${deClass}" title="DE: ${loadStatus.deCount} Karten"></span>
                </div>
                <span class="load-status">${statusText}</span>
            </div>
        `;
    }
    $setGrid.innerHTML = html;

    document.querySelectorAll('.set-icon-item').forEach(el => {
        el.addEventListener('click', () => {
            const code = el.dataset.code;
            selectSet(code);
        });
    });
}

// ------------------------------------------------------------
// 6. SET-SUCHE (Live-Filter)
// ------------------------------------------------------------
$setSearch.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    state.searchQuery = query;

    if (!query) {
        renderSetGrid(state.filteredSets);
        return;
    }

    const filtered = state.filteredSets.filter(s => {
        const name = (s.name || '').toLowerCase();
        const code = s.code.toLowerCase();
        return name.includes(query) || code.includes(query);
    });

    renderSetGrid(filtered);
});

function updateSelectedSetInGrid(code) {
    document.querySelectorAll('.set-icon-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.code === code);
    });
}

// ------------------------------------------------------------
// 7. SET AUSWÄHLEN + KARTEN LADEN (EN + DE parallel)
// ------------------------------------------------------------
async function selectSet(code) {
    updateSelectedSetInGrid(code);
    
    state.selectedSetCode = code;
    state.currentCards = [];
    state.germanCardsMap = new Map();
    
    $cardSearch.disabled = true;
    $searchBtn.disabled = true;

    $status.innerText = `📥 Lade Karten von ${code.toUpperCase()} (EN + DE parallel) …`;

    try {
        // Prüfe zuerst den Cache für BEIDE Sprachen
        const cachedEn = await getCachedSet(code + '_en');
        const cachedDe = await getCachedSet(code + '_de');
        
        let enCards, deCards;
        
        if (cachedEn && cachedDe) {
            // Beide Sprachen aus Cache laden
            enCards = cachedEn.data;
            deCards = cachedDe.data;
            $status.innerText = `📦 ${code.toUpperCase()} aus Cache geladen (EN + DE)`;
        } else {
            // BEIDE Sprachen parallel laden
            [enCards, deCards] = await Promise.all([
                fetchSetCards(code, 'en'),
                fetchSetCards(code, 'de')
            ]);
            
            // BEIDE Sprachen cachen
            if (enCards.length > 0) {
                await cacheSet(code + '_en', enCards);
            }
            if (deCards.length > 0) {
                await cacheSet(code + '_de', deCards);
            }
        }

        // Status speichern
        const loadStatus = {
            enLoaded: enCards.length > 0,
            deLoaded: deCards.length > 0,
            enCount: enCards.length,
            deCount: deCards.length,
        };
        state.loadStatuses.set(code, loadStatus);
        await setLoadStatus(code, loadStatus);

        // Deutsche Namen mappen (Schlüssel = oracle_id für Eindeutigkeit)
        for (const deCard of deCards) {
            const germanName = extractGermanName(deCard);
            if (germanName && deCard.oracle_id) {
                state.germanCardsMap.set(deCard.oracle_id, germanName);
            }
        }

        // Auch aus englischen Karten printed_name extrahieren
        for (const enCard of enCards) {
            const germanName = extractGermanName(enCard);
            if (germanName && enCard.oracle_id) {
                // Nur setzen wenn nicht schon von DE-Karten vorhanden
                if (!state.germanCardsMap.has(enCard.oracle_id)) {
                    state.germanCardsMap.set(enCard.oracle_id, germanName);
                }
            }
        }

        // Englische Karten sind die Hauptliste
        state.currentCards = enCards;

        if (enCards.length > 0) {
            $cardSearch.disabled = false;
            $searchBtn.disabled = false;
            $status.innerText =
                `✅ ${enCards.length} EN / ${deCards.length} DE Karten geladen (${code.toUpperCase()}). Suche starten.`;
        } else if (deCards.length > 0) {
            // Fallback: Falls keine EN-Karten, nutze DE als Basis
            state.currentCards = deCards;
            $cardSearch.disabled = false;
            $searchBtn.disabled = false;
            $status.innerText =
                `⚠️ Nur ${deCards.length} DE Karten gefunden (${code.toUpperCase()}).`;
        } else {
            $status.innerText = `⚠️ Keine Karten für ${code.toUpperCase()} gefunden.`;
        }

        updateLoadIndicatorsInGrid();
        updateOverallProgress();

    } catch (err) {
        $status.innerText = '❌ Fehler: ' + err.message;
        console.error(err);
    }
}

function updateLoadIndicatorsInGrid() {
    document.querySelectorAll('.set-icon-item').forEach(el => {
        const code = el.dataset.code;
        const loadStatus = state.loadStatuses.get(code);
        if (!loadStatus) return;
        
        const enBar = el.querySelector('.load-indicator span:first-child');
        const deBar = el.querySelector('.load-indicator span:last-child');
        const statusText = el.querySelector('.load-status');
        
        if (enBar) {
            enBar.className = loadStatus.enLoaded ? 'en-loaded' : '';
            enBar.title = `EN: ${loadStatus.enCount} Karten`;
        }
        if (deBar) {
            deBar.className = loadStatus.deLoaded ? 'de-loaded' : '';
            deBar.title = `DE: ${loadStatus.deCount} Karten`;
        }
        if (statusText) {
            statusText.textContent = (loadStatus.enLoaded && loadStatus.deLoaded) ? '✓ EN+DE' :
                loadStatus.enLoaded ? '✓ EN' : loadStatus.deLoaded ? '✓ DE' : '—';
        }
    });
}

async function fetchSetCards(code, lang) {
    const url = `https://api.scryfall.com/cards/search?q=e:${code}+lang:${lang}`;
    let allCards = [];
    let nextUrl = url;
    let page = 0;

    while (nextUrl) {
        page++;
        $status.innerText = `📥 Lade Seite ${page} von ${code.toUpperCase()} (${lang.toUpperCase()}) …`;
        const resp = await fetch(nextUrl);
        if (!resp.ok) {
            if (resp.status === 404) return [];
            throw new Error(`API-Fehler: ${resp.status}`);
        }
        const json = await resp.json();
        if (json.data) {
            allCards = allCards.concat(json.data);
        }
        nextUrl = json.next_page || null;
        await new Promise(r => setTimeout(r, 80));
    }

    return allCards;
}

// ------------------------------------------------------------
// 8. SUCHE / AUTOCOMPLETE (EN + DE gleichzeitig)
// ------------------------------------------------------------
function getGermanNameForCard(card) {
    // 1. Über oracle_id in der Map suchen
    if (card.oracle_id && state.germanCardsMap.has(card.oracle_id)) {
        return state.germanCardsMap.get(card.oracle_id);
    }
    // 2. printed_name direkt an der Karte
    if (card.printed_name && card.printed_name !== card.name) {
        return card.printed_name;
    }
    return null;
}

$cardSearch.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    if (query.length < 2) {
        $suggestions.classList.add('hidden');
        return;
    }

    const matches = state.currentCards
        .filter(c => {
            // Englischen Namen prüfen
            if (c.name.toLowerCase().includes(query)) return true;
            // Deutschen Namen prüfen
            const germanName = getGermanNameForCard(c);
            if (germanName && germanName.toLowerCase().includes(query)) return true;
            return false;
        })
        .slice(0, 15);

    if (matches.length === 0) {
        $suggestions.classList.add('hidden');
        return;
    }

    let html = '';
    for (const card of matches) {
        const num = card.collector_number || '?';
        const setCode = card.set || state.selectedSetCode;
        const germanName = getGermanNameForCard(card);
        let displayName = card.name;
        let langBadge = '';
        let subName = '';

        if (germanName && germanName !== card.name) {
            displayName = germanName;
            langBadge = `<span class="lang-badge">DE</span>`;
            subName = `<span class="english-name">${card.name}</span>`;
        }

        html += `
            <div class="suggestion-item" data-card-index="${state.currentCards.indexOf(card)}">
                <span class="suggestion-name">
                    ${displayName}
                    ${langBadge}
                    ${subName}
                </span>
                <span class="suggestion-set">${setCode.toUpperCase()} #${num}</span>
            </div>
        `;
    }
    $suggestions.innerHTML = html;
    $suggestions.classList.remove('hidden');

    document.querySelectorAll('.suggestion-item').forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.cardIndex, 10);
            if (!isNaN(idx) && state.currentCards[idx]) {
                addCardToMyList(state.currentCards[idx]);
            }
        });
    });

    $searchBtn.onclick = () => {
        if (matches.length > 0) {
            addCardToMyList(matches[0]);
        }
    };
});

// ------------------------------------------------------------
// 9. KARTE HINZUFÜGEN
// ------------------------------------------------------------
function addCardToMyList(card) {
    // Füge Karte mit Timestamp hinzu für Sortierung (neueste zuerst)
    state.myCards.unshift({
        name: card.name,
        set: card.set || state.selectedSetCode,
        number: card.collector_number || '0',
        addedAt: Date.now() // Timestamp für Sortierung
    });
    saveMyCards(state.myCards);
    renderCardList();
    updateExport();
    $cardSearch.value = '';
    $suggestions.classList.add('hidden');
    $cardSearch.focus();
    $status.innerText = `✅ ${card.name} hinzugefügt (automatisch gespeichert).`;
    $storageInfo.textContent = `gespeichert (${state.myCards.length} Karten)`;
}

// ------------------------------------------------------------
// 10. LISTE & EXPORT
// ------------------------------------------------------------
function renderCardList() {
    if (state.myCards.length === 0) {
        $cardList.innerHTML = '<div class="text-muted" style="padding:0.8rem; text-align:center;">Noch keine Karten ausgewählt.</div>';
        $cardCount.innerText = '0';
        return;
    }
    
    // Karten sind bereits nach Hinzufügen sortiert (neueste zuerst durch unshift)
    let html = '';
    state.myCards.forEach((c, idx) => {
        html += `
            <div class="card-list-item">
                <span>${c.name} <span class="text-muted">(${c.set.toUpperCase()}) #${c.number}</span></span>
                <button class="remove-btn" data-index="${idx}">✕</button>
            </div>
        `;
    });
    $cardList.innerHTML = html;
    $cardCount.innerText = state.myCards.length;

    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index, 10);
            if (!isNaN(idx)) {
                state.myCards.splice(idx, 1);
                saveMyCards(state.myCards);
                renderCardList();
                updateExport();
                $status.innerText = `🗑️ Karte entfernt (automatisch gespeichert).`;
                $storageInfo.textContent = `gespeichert (${state.myCards.length} Karten)`;
            }
        });
    });
}

function updateExport() {
    const lines = state.myCards.map(c =>
        `1 ${c.name} (${c.set.toUpperCase()}) ${c.number}`
    );
    $exportArea.value = lines.join('\n');
}

// ------------------------------------------------------------
// 11. EXPORT / LEEREN
// ------------------------------------------------------------
$exportBtn.addEventListener('click', async () => {
    const text = $exportArea.value;
    if (!text) {
        $status.innerText = '⚠️ Es gibt nichts zu kopieren.';
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        $status.innerText = '📋 Export in Zwischenablage kopiert!';
    } catch {
        $exportArea.select();
        document.execCommand('copy');
        $status.innerText = '📋 Export kopiert (Fallback).';
    }
});

$clearBtn.addEventListener('click', () => {
    if (state.myCards.length === 0) return;
    if (confirm('Wirklich alle Karten aus der Liste entfernen?')) {
        state.myCards = [];
        saveMyCards(state.myCards);
        renderCardList();
        updateExport();
        $status.innerText = '🗑️ Liste geleert (automatisch gespeichert).';
        $storageInfo.textContent = `gespeichert (0 Karten)`;
    }
});

// ------------------------------------------------------------
// 12. TASTATUR-SHORTCUT (verbessert)
// ------------------------------------------------------------
$cardSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const suggestions = document.querySelectorAll('.suggestion-item');
        
        if (suggestions.length === 0) {
            // Keine Vorschläge vorhanden
            $status.innerText = '⚠️ Keine Karten für diese Suche gefunden.';
        } else if (suggestions.length === 1) {
            // Nur ein Vorschlag - direkt auswählen
            suggestions[0].click();
        } else {
            // Mehrere Vorschläge - Benutzer muss auswählen
            $status.innerText = '⚠️ Bitte wähle eine Karte aus der Liste aus (klicken).';
            // Optional: ersten Vorschlag visuell hervorheben
            suggestions.forEach(s => s.style.background = '');
            suggestions[0].style.background = 'var(--highlight-bg, #e3f2fd)';
        }
    }
    
    // Pfeiltasten-Navigation für bessere Auswahl
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const suggestions = document.querySelectorAll('.suggestion-item');
        if (suggestions.length === 0) return;
        
        // Finde aktuell hervorgehobenen Vorschlag
        let currentIndex = -1;
        suggestions.forEach((s, i) => {
            if (s.style.background && s.style.background !== '') {
                currentIndex = i;
            }
        });
        
        // Entferne alte Hervorhebung
        suggestions.forEach(s => s.style.background = '');
        
        // Berechne neuen Index
        if (e.key === 'ArrowDown') {
            currentIndex = currentIndex < suggestions.length - 1 ? currentIndex + 1 : 0;
        } else {
            currentIndex = currentIndex > 0 ? currentIndex - 1 : suggestions.length - 1;
        }
        
        // Hebe neuen Vorschlag hervor
        suggestions[currentIndex].style.background = 'var(--highlight-bg, #e3f2fd)';
        suggestions[currentIndex].scrollIntoView({ block: 'nearest' });
    }
});

// ------------------------------------------------------------
// 13. INIT
// ------------------------------------------------------------
loadAllSets();

console.log('🃏 Alte-Sets-Import-Tool geladen (alle Sets vor M15).');
console.log(`📋 ${state.myCards.length} Karten aus localStorage geladen.`);
console.log('🌍 Suche durchsucht gleichzeitig englische UND deutsche Kartennamen.');
console.log('📊 Ladebalken zeigen EN (grün) und DE (blau) Status pro Set.');
console.log('💡 Tipp: Mit Pfeiltasten durch Vorschläge navigieren, mit Enter bestätigen!');
