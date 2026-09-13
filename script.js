const SUPABASE_URL = 'https://yqxwiitsdxmypemwgows.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_K8L3IhB63xeahlLRr7Wyhw_o4rkxA8j';
const SUPABASE_BUCKET = 'gf-romance-media';
const ADMIN_ACCOUNTS = {
  'maxwill': 'iem@umpsa.edu.my',
  'iem@umpsa.edu.my': 'iem@umpsa.edu.my',
  'maxwill.tann@gmail.com': 'maxwill.tann@gmail.com'
};
const ADMIN_SESSION_KEY = 'gf_supabase_admin_session_v1';
const WISH_DELETE_TOKENS_KEY = 'gf_wish_delete_tokens_v1';

const DEFAULT_CONFIG = {
  yourName: 'Maxwill',
  partnerName: 'You',
  relationshipStart: '2023-01-01T00:00:00',
  heroTitle: 'For my favourite person.',
  heroMessage: 'I wanted somewhere that feels a little like us — soft, warm, slightly chaotic, and full of memories I never want to forget.',
  heroCaption: 'still my favourite view ♡',
  galleryCount: 6,
  galleryCaptions: ['one of those days ♡','our favourite place','you looked so happy here','still makes me smile','tiny moments & big feelings','us being us'],
  reasonTitles: ['Your smile','The ordinary days','Your support','Your little things'],
  reasonShorts: ['Especially when you try not to laugh.','You somehow make them special.','Even when I am overthinking everything.','The details I notice more than you think.'],
  reasonMessages: [
    'The way your smile changes the mood of an entire day is still unfair.',
    'You make ordinary days feel worth remembering, and I don’t think you realise how rare that is.',
    'There is a version of me that exists because you believed in me before I knew how to believe in myself.',
    'The random reactions, weird jokes, little habits — all the things that make you completely you.'
  ],
  letterGreeting: 'Hi love,',
  letterBody: 'I made this little place because photos get buried in galleries, messages disappear in chat histories, and sometimes I just want you to have something that says the same thing every time you open it: you matter to me.\n\nThank you for being part of the ordinary days, the difficult ones, the funny ones, and the moments I still replay in my head for no reason except that they make me happy.\n\nThis page is only a start. I want to fill it with our real photos, our actual dates, our stupid jokes, our songs, and every little memory that belongs to us.',
  signature: 'Always yours, Maxwill ♡'
};

let siteConfig = { ...DEFAULT_CONFIG };
let mediaPaths = {};
let mediaCache = {};
let wishlistItems = [];
let pendingWishDeleteId = null;
let pendingGalleryDeleteCard = null;
let musicOn = false;
let customizerDirty = false;
let customizerPreviewUrls = [];
let galleryRaf = null;
let galleryX = 0;
let galleryLoopWidth = 0;
let gallerySpeed = 0;
let galleryDragging = false;
let galleryPointerId = null;
let galleryStartX = 0;
let galleryStartTranslate = 0;
let galleryLastFrame = 0;
let galleryResumeAt = 0;

const $ = (id) => document.getElementById(id);
const pad = (value) => String(value).padStart(2, '0');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const GALLERY_GRADIENTS = ['gradient-a','gradient-b','gradient-c','gradient-d','gradient-e','gradient-f'];

function escapeHtml(value='') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function paragraphsToHtml(text='') {
  return text.split(/\n\s*\n/).filter(Boolean).map(p => `<p>${escapeHtml(p).replace(/\n/g,'<br>')}</p>`).join('');
}
function normalizeWishUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}
function publicMediaUrl(path) {
  if (!path) return '';
  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
function getGalleryCount() {
  return Math.max(1, Number(siteConfig.galleryCount) || siteConfig.galleryCaptions?.length || 6);
}
function wishDeleteTokens() {
  try { return JSON.parse(localStorage.getItem(WISH_DELETE_TOKENS_KEY) || '{}'); }
  catch { return {}; }
}
function saveWishDeleteToken(id, token) {
  const map = wishDeleteTokens();
  map[id] = token;
  localStorage.setItem(WISH_DELETE_TOKENS_KEY, JSON.stringify(map));
}
function removeWishDeleteToken(id) {
  const map = wishDeleteTokens();
  delete map[id];
  localStorage.setItem(WISH_DELETE_TOKENS_KEY, JSON.stringify(map));
}

function showToast(message, duration = 2400) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.textContent = 'You are very loved ♡'; }, 250);
  }, duration);
}

async function apiFetch(path, options = {}, useAdmin = false) {
  const headers = new Headers(options.headers || {});
  headers.set('apikey', SUPABASE_PUBLISHABLE_KEY);
  if (useAdmin) {
    const token = await getAdminAccessToken();
    if (!token) throw new Error('Please sign in to Customize again.');
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers, cache: 'no-store' });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body?.message || body?.msg || body?.error_description || body?.error || message;
    } catch {}
    throw new Error(message);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function readAdminSession() {
  try { return JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || 'null'); }
  catch { return null; }
}
function saveAdminSession(session) {
  sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
}
function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
}
async function refreshAdminSession(refreshToken) {
  const data = await apiFetch('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  }, false);
  const expiresAt = Date.now() + (Number(data.expires_in || 3600) * 1000);
  const session = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expiresAt };
  saveAdminSession(session);
  return session;
}
async function getAdminAccessToken() {
  const session = readAdminSession();
  if (!session?.access_token) return '';
  if (Number(session.expires_at || 0) > Date.now() + 60_000) return session.access_token;
  if (!session.refresh_token) { clearAdminSession(); return ''; }
  try { return (await refreshAdminSession(session.refresh_token)).access_token; }
  catch { clearAdminSession(); return ''; }
}
async function adminLogin(username, password) {
  const loginId = username.trim().toLowerCase();
  const email = ADMIN_ACCOUNTS[loginId] || (loginId.includes('@') ? loginId : '');
  if (!email || !Object.values(ADMIN_ACCOUNTS).includes(email)) throw new Error('Incorrect username or password.');
  const data = await apiFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  }, false);
  saveAdminSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (Number(data.expires_in || 3600) * 1000)
  });
  return true;
}
async function adminLogout() {
  const session = readAdminSession();
  if (session?.access_token) {
    try {
      await apiFetch('/auth/v1/logout', { method:'POST', headers:{ Authorization:`Bearer ${session.access_token}` } }, false);
    } catch {}
  }
  clearAdminSession();
}

async function loadRemoteSite() {
  const rows = await apiFetch('/rest/v1/gf_site_state?id=eq.1&select=config,media,updated_at', { method:'GET' });
  if (!Array.isArray(rows) || !rows[0]) return false;
  siteConfig = { ...DEFAULT_CONFIG, ...(rows[0].config || {}) };
  mediaPaths = rows[0].media && typeof rows[0].media === 'object' ? rows[0].media : {};
  mediaCache = {};
  for (const [key, path] of Object.entries(mediaPaths)) if (typeof path === 'string' && path) mediaCache[key] = publicMediaUrl(path);
  return true;
}
async function loadWishlist() {
  const rows = await apiFetch('/rest/v1/gf_wishlist?select=id,title,note,url,image_data,created_at&order=created_at.desc', { method:'GET' });
  wishlistItems = (Array.isArray(rows) ? rows : []).map(row => ({
    id: row.id,
    title: row.title,
    note: row.note || '',
    url: row.url || '',
    imageData: row.image_data || '',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now()
  }));
}
async function loadRemoteData() {
  const results = await Promise.allSettled([loadRemoteSite(), loadWishlist()]);
  const failures = results.filter(result => result.status === 'rejected');
  failures.forEach(result => console.error('Remote data load failed:', result.reason));
  if (failures.length === results.length) throw failures[0].reason;
  return failures.length === 0;
}

function setImage(img, placeholder, value) {
  if (!img) return;
  if (value) {
    img.src = value;
    img.hidden = false;
    if (placeholder) placeholder.hidden = true;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
    if (placeholder) placeholder.hidden = false;
  }
}

function renderWishlist() {
  const grid = $('wishlistGrid');
  const empty = $('wishlistEmpty');
  if (!grid || !empty) return;
  grid.innerHTML = '';
  if (!wishlistItems.length) {
    grid.hidden = true;
    empty.hidden = false;
    return;
  }
  grid.hidden = false;
  empty.hidden = true;
  wishlistItems.forEach((wish, index) => {
    const card = document.createElement('article');
    card.className = 'wish-card glass-card';
    card.style.setProperty('--wish-delay', `${Math.min(index, 8) * 45}ms`);
    const visual = document.createElement('div');
    visual.className = 'wish-card-visual';
    if (wish.imageData) {
      const img = document.createElement('img');
      img.src = wish.imageData;
      img.alt = wish.title;
      visual.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'wish-card-placeholder';
      placeholder.innerHTML = '<span>♡</span><small>wish</small>';
      visual.appendChild(placeholder);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'wish-delete';
    remove.dataset.deleteWish = wish.id;
    remove.setAttribute('aria-label', `Remove ${wish.title} from wishlist`);
    remove.textContent = '×';
    visual.appendChild(remove);
    card.appendChild(visual);
    const body = document.createElement('div');
    body.className = 'wish-card-body';
    const number = document.createElement('span');
    number.className = 'wish-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const title = document.createElement('h3');
    title.textContent = wish.title;
    body.append(number, title);
    if (wish.note) {
      const note = document.createElement('p');
      note.textContent = wish.note;
      body.appendChild(note);
    }
    const url = normalizeWishUrl(wish.url);
    if (url) {
      const link = document.createElement('a');
      link.className = 'wish-link';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'View item ↗';
      body.appendChild(link);
    }
    card.appendChild(body);
    grid.appendChild(card);
  });
}

function applyConfig() {
  document.title = `For ${siteConfig.partnerName || 'My Favourite Person'} 💗`;
  $('brandText').innerHTML = `${escapeHtml(siteConfig.yourName || 'Me')} <span>♡</span> ${escapeHtml(siteConfig.partnerName || 'You')}`;
  const heroWords = (siteConfig.heroTitle || 'For my favourite person.').trim();
  const lastSpace = heroWords.lastIndexOf(' ');
  $('heroTitle').innerHTML = lastSpace > 0
    ? `${escapeHtml(heroWords.slice(0,lastSpace))}<br><em>${escapeHtml(heroWords.slice(lastSpace+1))}</em>`
    : `<em>${escapeHtml(heroWords)}</em>`;
  $('heroMessage').textContent = siteConfig.heroMessage;
  $('heroCaption').textContent = siteConfig.heroCaption;
  setImage($('heroPhoto'), $('heroPhotoPlaceholder'), mediaCache.heroPhoto);
  for (let i = 1; i <= 4; i++) {
    $(`reasonTitle${i}`).textContent = siteConfig.reasonTitles[i-1] || '';
    $(`reasonShort${i}`).textContent = siteConfig.reasonShorts[i-1] || '';
    const card = document.querySelector(`[data-reason-index="${i}"]`);
    if (card) card.dataset.message = siteConfig.reasonMessages[i-1] || '';
  }
  renderPublicGallery();
  renderWishlist();
  $('letterGreeting').textContent = siteConfig.letterGreeting;
  $('letterBody').innerHTML = paragraphsToHtml(siteConfig.letterBody);
  $('letterSignature').innerHTML = `${escapeHtml(siteConfig.signature).replace(/,\s*/, ',<br><strong>')}</strong>`;
  const audio = $('loveSong');
  if (mediaCache.music) audio.src = mediaCache.music;
  else audio.removeAttribute('src');
  updateCounter();
}

function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function addYearsClamped(date, years) {
  const result = new Date(date);
  const targetYear = date.getFullYear() + years;
  const day = Math.min(date.getDate(), daysInMonth(targetYear, date.getMonth()));
  result.setFullYear(targetYear, date.getMonth(), day);
  return result;
}
function addMonthsClamped(date, months) {
  const totalMonths = date.getMonth() + months;
  const targetYear = date.getFullYear() + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  const day = Math.min(date.getDate(), daysInMonth(targetYear, targetMonth));
  const result = new Date(date);
  result.setFullYear(targetYear, targetMonth, day);
  return result;
}
function updateCounter() {
  const start = new Date(siteConfig.relationshipStart || DEFAULT_CONFIG.relationshipStart);
  const now = new Date();
  if (Number.isNaN(start.getTime()) || now < start) return;
  let years = now.getFullYear() - start.getFullYear();
  let cursor = addYearsClamped(start, years);
  if (cursor > now) { years--; cursor = addYearsClamped(start, years); }
  let months = 0;
  while (months < 11) {
    const next = addMonthsClamped(cursor, 1);
    if (next > now) break;
    cursor = next;
    months++;
  }
  let remaining = Math.max(0, now - cursor);
  const days = Math.floor(remaining / 86400000); remaining %= 86400000;
  const hours = Math.floor(remaining / 3600000); remaining %= 3600000;
  const minutes = Math.floor(remaining / 60000); remaining %= 60000;
  const seconds = Math.floor(remaining / 1000);
  $('yearsTogether').textContent = pad(years);
  $('monthsTogether').textContent = pad(months);
  $('daysTogether').textContent = pad(days);
  $('hoursTogether').textContent = pad(hours);
  $('minutesTogether').textContent = pad(minutes);
  $('secondsTogether').textContent = pad(seconds);
  const secondsUnit = $('secondsUnit');
  if (secondsUnit) { secondsUnit.classList.remove('tick'); void secondsUnit.offsetWidth; secondsUnit.classList.add('tick'); }
}
setInterval(updateCounter, 1000);

function renderPublicGallery() {
  const track = $('memoryTrack');
  if (!track) return;
  if (galleryRaf) cancelAnimationFrame(galleryRaf);
  galleryRaf = null;
  galleryLastFrame = 0;
  galleryX = 0;
  track.innerHTML = '';
  const count = getGalleryCount();
  const makeCard = (i, clone = false) => {
    const card = document.createElement('figure');
    card.className = 'memory-card';
    card.dataset.galleryIndex = i;
    if (clone) card.dataset.galleryClone = '1';
    card.innerHTML = `<div class="memory-photo ${GALLERY_GRADIENTS[i % GALLERY_GRADIENTS.length]}"><img class="gallery-img" alt="Memory ${i+1}" draggable="false" hidden><span>photo ${String(i+1).padStart(2,'0')}</span></div><figcaption>${escapeHtml(siteConfig.galleryCaptions[i] || `memory ${i+1} ♡`)}</figcaption>`;
    setImage(card.querySelector('.gallery-img'), card.querySelector('.memory-photo span'), mediaCache[`gallery-${i}`]);
    return card;
  };
  for (let i = 0; i < count; i++) track.appendChild(makeCard(i));
  for (let i = 0; i < count; i++) track.appendChild(makeCard(i, true));
  requestAnimationFrame(() => {
    const first = track.children[0];
    const clone = track.children[count];
    galleryLoopWidth = first && clone ? clone.offsetLeft - first.offsetLeft : 0;
    const durationSeconds = Math.max(22, count * 4.2);
    gallerySpeed = galleryLoopWidth ? galleryLoopWidth / (durationSeconds * 1000) : 0;
    galleryResumeAt = performance.now() + 700;
    galleryRaf = requestAnimationFrame(galleryFrame);
  });
}
function wrapGalleryX(value) {
  if (!galleryLoopWidth) return value;
  while (value <= -galleryLoopWidth) value += galleryLoopWidth;
  while (value > 0) value -= galleryLoopWidth;
  return value;
}
function paintGallery() {
  const track = $('memoryTrack');
  if (track) track.style.transform = `translate3d(${galleryX}px,0,0)`;
}
function galleryFrame(now) {
  if (!galleryLastFrame) galleryLastFrame = now;
  const dt = Math.min(40, now - galleryLastFrame);
  galleryLastFrame = now;
  if (!galleryDragging && now >= galleryResumeAt && galleryLoopWidth) {
    galleryX = wrapGalleryX(galleryX - gallerySpeed * dt);
    paintGallery();
  }
  galleryRaf = requestAnimationFrame(galleryFrame);
}
function setupMemorySwipe() {
  const marquee = $('memoryMarquee');
  if (!marquee) return;
  marquee.style.touchAction = 'pan-y';
  const startDrag = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    galleryDragging = true;
    galleryPointerId = e.pointerId;
    galleryStartX = e.clientX;
    galleryStartTranslate = galleryX;
    galleryResumeAt = Infinity;
    marquee.classList.add('is-dragging');
    try { marquee.setPointerCapture(e.pointerId); } catch {}
  };
  const moveDrag = (e) => {
    if (!galleryDragging || e.pointerId !== galleryPointerId) return;
    galleryX = wrapGalleryX(galleryStartTranslate + (e.clientX - galleryStartX));
    paintGallery();
  };
  const endDrag = (e) => {
    if (!galleryDragging || (e.pointerId != null && e.pointerId !== galleryPointerId)) return;
    galleryDragging = false;
    galleryPointerId = null;
    galleryResumeAt = performance.now() + 700;
    marquee.classList.remove('is-dragging');
  };
  marquee.addEventListener('pointerdown', startDrag);
  marquee.addEventListener('pointermove', moveDrag);
  marquee.addEventListener('pointerup', endDrag);
  marquee.addEventListener('pointercancel', endDrag);
  marquee.addEventListener('lostpointercapture', endDrag);
  marquee.addEventListener('dragstart', e => e.preventDefault());
  window.addEventListener('resize', () => renderPublicGallery());
}

function clearCustomizerPreviewUrls() {
  customizerPreviewUrls.forEach(url => URL.revokeObjectURL(url));
  customizerPreviewUrls = [];
}
function setCustomizerPreview(imgId, emptyId, value) {
  const img = $(imgId), empty = $(emptyId);
  if (!img || !empty) return;
  if (value) {
    img.src = value;
    img.hidden = false;
    empty.hidden = true;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
    empty.hidden = false;
  }
}
function previewSelectedImage(input, imgId, emptyId) {
  const file = input.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  customizerPreviewUrls.push(url);
  setCustomizerPreview(imgId, emptyId, url);
}
function setCustomizerSaved(saved = true) {
  customizerDirty = !saved;
  const status = $('customizeStatus');
  if (!status) return;
  status.classList.toggle('dirty', !saved);
  status.innerHTML = saved ? '<span></span> Saved online' : '<span></span> Unsaved changes';
}
function galleryEditorCards() { return [...document.querySelectorAll('#galleryEditorGrid .gallery-editor-card')]; }
function reindexGalleryEditorCards() {
  const cards = galleryEditorCards();
  cards.forEach((card, index) => {
    card.dataset.galleryEditor = index;
    const number = String(index + 1).padStart(2, '0');
    const img = card.querySelector('.gallery-editor-preview img');
    const empty = card.querySelector('.gallery-preview-empty');
    const file = card.querySelector('input[type="file"]');
    const caption = card.querySelector('.compact-field input');
    if (img) { img.id = `cfgGalleryPreview${index}`; img.alt = `Gallery photo ${index + 1}`; }
    if (empty) { empty.id = `cfgGalleryEmpty${index}`; empty.textContent = number; }
    if (file) file.id = `cfgGalleryPhoto${index}`;
    if (caption) { caption.id = `cfgGalleryCaption${index}`; caption.placeholder = `memory ${index + 1} ♡`; }
  });
  updateGalleryEditorCount();
}
function updateGalleryEditorCount() {
  const cards = galleryEditorCards();
  const count = cards.length;
  if ($('galleryEditorCount')) $('galleryEditorCount').textContent = count;
  cards.forEach(card => {
    const btn = card.querySelector('[data-remove-gallery]');
    if (btn) btn.disabled = count <= 1;
  });
}
function addGalleryEditorCard(index, caption = '', value = null, mediaPath = '') {
  const grid = $('galleryEditorGrid');
  if (!grid) return;
  const number = String(index + 1).padStart(2, '0');
  const card = document.createElement('article');
  card.className = 'gallery-editor-card';
  card.dataset.galleryEditor = index;
  card.dataset.mediaPath = mediaPath || '';
  card.innerHTML = `
    <div class="gallery-editor-preview">
      <img id="cfgGalleryPreview${index}" alt="Gallery photo ${index + 1}" hidden>
      <div id="cfgGalleryEmpty${index}" class="gallery-preview-empty">${number}</div>
      <button class="gallery-memory-remove" type="button" data-remove-gallery aria-label="Remove memory ${index + 1}">Remove</button>
    </div>
    <label class="gallery-file-btn">Choose photo<input id="cfgGalleryPhoto${index}" type="file" accept="image/*"></label>
    <label class="compact-field">Caption<input id="cfgGalleryCaption${index}" type="text" value="${escapeHtml(caption)}" placeholder="memory ${index + 1} ♡"></label>`;
  grid.appendChild(card);
  setCustomizerPreview(`cfgGalleryPreview${index}`, `cfgGalleryEmpty${index}`, value);
  updateGalleryEditorCount();
}
function renderGalleryEditor() {
  const grid = $('galleryEditorGrid');
  if (!grid) return;
  clearCustomizerPreviewUrls();
  grid.innerHTML = '';
  setCustomizerPreview('cfgHeroPreview', 'cfgHeroPreviewEmpty', mediaCache.heroPhoto);
  for (let i = 0; i < getGalleryCount(); i++) addGalleryEditorCard(i, siteConfig.galleryCaptions[i] || '', mediaCache[`gallery-${i}`], mediaPaths[`gallery-${i}`] || '');
  if ($('musicFileStatus')) $('musicFileStatus').textContent = mediaCache.music ? 'Song uploaded ♡' : 'No song uploaded yet';
}
function fillForm() {
  $('cfgYourName').value = siteConfig.yourName;
  $('cfgPartnerName').value = siteConfig.partnerName;
  $('cfgStart').value = String(siteConfig.relationshipStart || '').slice(0,16);
  $('cfgHeroTitle').value = siteConfig.heroTitle;
  $('cfgHeroMessage').value = siteConfig.heroMessage;
  $('cfgHeroCaption').value = siteConfig.heroCaption;
  for (let i = 1; i <= 4; i++) {
    $(`cfgReasonTitle${i}`).value = siteConfig.reasonTitles[i-1] || '';
    $(`cfgReasonShort${i}`).value = siteConfig.reasonShorts[i-1] || '';
    $(`cfgReasonMessage${i}`).value = siteConfig.reasonMessages[i-1] || '';
  }
  $('cfgLetterGreeting').value = siteConfig.letterGreeting;
  $('cfgLetterBody').value = siteConfig.letterBody;
  $('cfgSignature').value = siteConfig.signature;
  $('cfgHeroPhoto').value = '';
  $('cfgMusic').value = '';
  renderGalleryEditor();
  setCustomizerSaved(true);
}

async function compressImageBlob(file, maxDimension = 1600, quality = 0.82) {
  if (!mimeForFile(file).startsWith('image/')) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const output = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  return output || file;
}
function extForMime(type) {
  return ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','audio/mpeg':'mp3','audio/mp4':'m4a','audio/x-m4a':'m4a','audio/wav':'wav','audio/wave':'wav','audio/x-wav':'wav'})[type] || 'bin';
}
function mimeForFile(file) {
  if (file?.type) return file.type;
  const ext = String(file?.name || '').split('.').pop().toLowerCase();
  return ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav'})[ext] || 'application/octet-stream';
}
async function uploadAdminMedia(file, kind, index = '') {
  const token = await getAdminAccessToken();
  if (!token) throw new Error('Please sign in to Customize again.');
  let uploadFile = file;
  const originalMime = mimeForFile(file);
  if (originalMime.startsWith('image/')) uploadFile = await compressImageBlob(file);
  const uploadMime = mimeForFile(uploadFile) === 'application/octet-stream' ? originalMime : mimeForFile(uploadFile);
  const ext = extForMime(uploadMime);
  const suffix = index === '' ? '' : `-${index}`;
  const path = `site/${kind}${suffix}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${encodedPath}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': uploadMime,
      'x-upsert': 'false'
    },
    body: uploadFile
  });
  if (!response.ok) {
    let message = `Upload failed (${response.status})`;
    try { const body = await response.json(); message = body?.message || body?.error || message; } catch {}
    throw new Error(message);
  }
  return path;
}
async function saveForm() {
  const saveBtn = $('saveSettingsBtn');
  const originalText = saveBtn?.textContent;
  try {
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
    const galleryCards = galleryEditorCards();
    const newGalleryCount = Math.max(1, galleryCards.length);
    const galleryCaptions = galleryCards.map((card, i) => card.querySelector('.compact-field input')?.value.trim() || DEFAULT_CONFIG.galleryCaptions[i] || `memory ${i+1} ♡`);
    siteConfig = {
      ...siteConfig,
      yourName: $('cfgYourName').value.trim() || DEFAULT_CONFIG.yourName,
      partnerName: $('cfgPartnerName').value.trim() || DEFAULT_CONFIG.partnerName,
      relationshipStart: $('cfgStart').value ? `${$('cfgStart').value}:00` : DEFAULT_CONFIG.relationshipStart,
      heroTitle: $('cfgHeroTitle').value.trim() || DEFAULT_CONFIG.heroTitle,
      heroMessage: $('cfgHeroMessage').value.trim() || DEFAULT_CONFIG.heroMessage,
      heroCaption: $('cfgHeroCaption').value.trim() || DEFAULT_CONFIG.heroCaption,
      galleryCount: newGalleryCount,
      galleryCaptions,
      reasonTitles: Array.from({length:4},(_,i)=>$(`cfgReasonTitle${i+1}`).value.trim() || DEFAULT_CONFIG.reasonTitles[i] || ''),
      reasonShorts: Array.from({length:4},(_,i)=>$(`cfgReasonShort${i+1}`).value.trim() || DEFAULT_CONFIG.reasonShorts[i] || ''),
      reasonMessages: Array.from({length:4},(_,i)=>$(`cfgReasonMessage${i+1}`).value.trim() || DEFAULT_CONFIG.reasonMessages[i] || ''),
      letterGreeting: $('cfgLetterGreeting').value.trim() || DEFAULT_CONFIG.letterGreeting,
      letterBody: $('cfgLetterBody').value.trim() || DEFAULT_CONFIG.letterBody,
      signature: $('cfgSignature').value.trim() || DEFAULT_CONFIG.signature
    };
    const nextMedia = {};
    if (mediaPaths.heroPhoto) nextMedia.heroPhoto = mediaPaths.heroPhoto;
    if (mediaPaths.music) nextMedia.music = mediaPaths.music;
    const heroFile = $('cfgHeroPhoto').files?.[0];
    if (heroFile) nextMedia.heroPhoto = await uploadAdminMedia(heroFile, 'hero');
    for (let i = 0; i < galleryCards.length; i++) {
      const card = galleryCards[i];
      const file = card.querySelector('input[type="file"]')?.files?.[0];
      if (file) nextMedia[`gallery-${i}`] = await uploadAdminMedia(file, 'gallery', i);
      else if (card.dataset.mediaPath) nextMedia[`gallery-${i}`] = card.dataset.mediaPath;
    }
    const musicFile = $('cfgMusic').files?.[0];
    if (musicFile) {
      if (musicFile.size > 25 * 1024 * 1024) throw new Error('Music file must be 25 MB or smaller.');
      nextMedia.music = await uploadAdminMedia(musicFile, 'music');
    }
    await apiFetch('/rest/v1/gf_site_state?id=eq.1', {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json', Prefer:'return=minimal' },
      body: JSON.stringify({ config: siteConfig, media: nextMedia, updated_at: new Date().toISOString() })
    }, true);
    mediaPaths = nextMedia;
    mediaCache = {};
    for (const [key,path] of Object.entries(mediaPaths)) mediaCache[key] = publicMediaUrl(path);
    applyConfig();
    fillForm();
    setCustomizerSaved(true);
    showToast('Saved online ♡ Your website is updated everywhere.', 3200);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Could not save changes.', 4200);
    throw error;
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = originalText || 'Save Changes ♡'; }
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
async function compressWishImageToDataUrl(file) {
  let blob = await compressImageBlob(file, 900, 0.74);
  let dataUrl = await blobToDataUrl(blob);
  if (dataUrl.length <= 480000) return dataUrl;
  blob = await compressImageBlob(file, 680, 0.62);
  dataUrl = await blobToDataUrl(blob);
  if (dataUrl.length <= 480000) return dataUrl;
  blob = await compressImageBlob(file, 520, 0.5);
  dataUrl = await blobToDataUrl(blob);
  if (dataUrl.length > 480000) throw new Error('That wishlist photo is too large. Please choose a smaller image.');
  return dataUrl;
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map(b => b.toString(16).padStart(2,'0')).join('');
}

function resetWishComposer() {
  $('wishForm')?.reset();
  if ($('wishPreview')) { $('wishPreview').hidden = true; $('wishPreview').removeAttribute('src'); }
  if ($('wishPreviewEmpty')) $('wishPreviewEmpty').hidden = false;
}
function openWishComposer() {
  resetWishComposer();
  openModal($('wishModal'));
  setTimeout(() => $('wishTitle')?.focus(), 180);
}

async function addWishlistItem() {
  const title = $('wishTitle').value.trim();
  if (!title) throw new Error('Please enter an item name.');
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const file = $('wishPhoto').files?.[0];
  const imageData = file ? await compressWishImageToDataUrl(file) : null;
  const body = {
    title,
    note: $('wishNote').value.trim().slice(0,500),
    url: normalizeWishUrl($('wishUrl').value),
    image_data: imageData,
    delete_token_hash: tokenHash
  };
  const rows = await apiFetch('/rest/v1/gf_wishlist?select=id,title,note,url,image_data,created_at', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Prefer:'return=representation' },
    body: JSON.stringify(body)
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.id) throw new Error('Wishlist item was saved but could not be loaded.');
  saveWishDeleteToken(row.id, token);
  wishlistItems.unshift({ id:row.id, title:row.title, note:row.note || '', url:row.url || '', imageData:row.image_data || '', createdAt:new Date(row.created_at).getTime() });
}
async function deleteWishlistItem(id) {
  const localToken = wishDeleteTokens()[id] || '';
  const adminToken = await getAdminAccessToken();
  const headers = { Prefer:'return=representation' };
  if (localToken) headers['x-client-info'] = localToken;
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  headers.apikey = SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/gf_wishlist?id=eq.${encodeURIComponent(id)}&select=id`, { method:'DELETE', headers });
  if (!response.ok) {
    let message = 'Could not remove this wish.';
    try { const data = await response.json(); message = data?.message || data?.error || message; } catch {}
    throw new Error(message);
  }
  let deleted = [];
  try { deleted = await response.json(); } catch {}
  if (!Array.isArray(deleted) || !deleted.length) throw new Error('This wish can be removed from the phone that added it, or after you log in to Customize.');
  removeWishDeleteToken(id);
  wishlistItems = wishlistItems.filter(item => item.id !== id);
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function exportSiteData() {
  downloadJson('site-data-backup.json', { version:5, config:siteConfig, media:mediaPaths, wishlist:wishlistItems });
  showToast('Backup downloaded ♡');
}
async function importFromFile(file) {
  const payload = JSON.parse(await file.text());
  if (!payload?.config) throw new Error('Invalid backup file.');
  siteConfig = { ...DEFAULT_CONFIG, ...payload.config };
  if (payload.media && typeof payload.media === 'object') mediaPaths = payload.media;
  mediaCache = {};
  for (const [key,path] of Object.entries(mediaPaths)) if (path) mediaCache[key] = publicMediaUrl(path);
  applyConfig();
  fillForm();
  setCustomizerSaved(false);
  showToast('Backup loaded. Press Save Changes to publish it ♡', 3600);
}
async function resetAll() {
  const ok = window.confirm('Reset the main site and clear the wishlist? This cannot be undone.');
  if (!ok) return;
  const token = await getAdminAccessToken();
  if (!token) throw new Error('Please sign in to Customize again.');
  await apiFetch('/rest/v1/gf_site_state?id=eq.1', {
    method:'PATCH', headers:{'Content-Type':'application/json', Prefer:'return=minimal'},
    body:JSON.stringify({ config:DEFAULT_CONFIG, media:{}, updated_at:new Date().toISOString() })
  }, true);
  await apiFetch('/rest/v1/gf_wishlist?id=not.is.null', { method:'DELETE', headers:{Prefer:'return=minimal'} }, true);
  siteConfig = { ...DEFAULT_CONFIG };
  mediaPaths = {};
  mediaCache = {};
  wishlistItems = [];
  applyConfig(); fillForm();
  showToast('Reset complete ♡');
}

function openModal(modal) {
  if (!modal) return;
  modal.classList.add('active');
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
}
function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden','true');
  document.body.style.overflow='';
}

const SETTINGS_LABELS = { basics:'Basics', photos:'Photos', reasons:'Love cards', wishlist:'Wishlist', letter:'Love letter', music:'Music & backup' };
function activateSettingsPage(name) {
  document.querySelectorAll('.settings-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.settingsTab === name));
  document.querySelectorAll('.settings-page').forEach(page => page.classList.toggle('active', page.dataset.settingsPage === name));
  if ($('currentSettingsLabel')) $('currentSettingsLabel').textContent = `Editing · ${SETTINGS_LABELS[name] || 'Customize'}`;
  if (window.innerWidth <= 760 && $('settingsContent')) $('settingsContent').scrollIntoView({behavior:'smooth', block:'start'});
}
async function openCustomizer() {
  fillForm();
  activateSettingsPage('basics');
  openModal($('customizeModal'));
}
async function requestCustomizerAccess() {
  if (await getAdminAccessToken()) return openCustomizer();
  $('customizeAuthForm')?.reset();
  if ($('customizerAuthError')) $('customizerAuthError').textContent = '';
  openModal($('customizeAuthModal'));
  setTimeout(() => $('customizerUsername')?.focus(), 80);
}

function bindEvents() {
  document.querySelectorAll('.settings-tab').forEach(tab => tab.addEventListener('click', () => activateSettingsPage(tab.dataset.settingsTab)));
  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal($(btn.dataset.close))));
  document.querySelectorAll('.modal').forEach(modal => modal.addEventListener('click', e => { if (e.target === modal) closeModal(modal); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal.active').forEach(closeModal); });

  $('customizeBtn')?.addEventListener('click', requestCustomizerAccess);
  $('customizeAuthForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const error = $('customizerAuthError');
    const submit = e.submitter;
    try {
      if (submit) submit.disabled = true;
      if (error) error.textContent = '';
      await adminLogin($('customizerUsername').value, $('customizerPassword').value);
      closeModal($('customizeAuthModal'));
      await openCustomizer();
    } catch (err) {
      if (error) error.textContent = 'Incorrect username or password.';
      $('customizerPassword')?.select();
    } finally { if (submit) submit.disabled = false; }
  });
  $('lockCustomizerBtn')?.addEventListener('click', async () => {
    await adminLogout();
    closeModal($('customizeModal'));
    showToast('Customizer locked ♡');
  });
  $('viewSiteBtn')?.addEventListener('click', () => closeModal($('customizeModal')));
  $('saveSettingsBtn')?.addEventListener('click', () => saveForm().catch(()=>{}));
  $('exportSettingsBtn')?.addEventListener('click', exportSiteData);
  $('importSettingsInput')?.addEventListener('change', e => e.target.files?.[0] && importFromFile(e.target.files[0]).catch(err => showToast(err.message, 3800)));
  $('resetSettingsBtn')?.addEventListener('click', () => resetAll().catch(err => showToast(err.message, 3800)));

  $('cfgHeroPhoto')?.addEventListener('change', e => { previewSelectedImage(e.target,'cfgHeroPreview','cfgHeroPreviewEmpty'); setCustomizerSaved(false); });
  $('galleryEditorGrid')?.addEventListener('change', e => {
    if (!e.target.matches('input[type="file"]')) return;
    const card = e.target.closest('.gallery-editor-card');
    const index = Number(card?.dataset.galleryEditor);
    if (!Number.isInteger(index)) return;
    previewSelectedImage(e.target,`cfgGalleryPreview${index}`,`cfgGalleryEmpty${index}`);
    setCustomizerSaved(false);
  });
  $('addGalleryPhotoBtn')?.addEventListener('click', () => {
    const index = galleryEditorCards().length;
    addGalleryEditorCard(index, '', null, '');
    setCustomizerSaved(false);
  });
  $('galleryEditorGrid')?.addEventListener('click', e => {
    const button = e.target.closest('[data-remove-gallery]');
    if (!button || button.disabled) return;
    const card = button.closest('.gallery-editor-card');
    if (!card || galleryEditorCards().length <= 1) return;
    pendingGalleryDeleteCard = card;
    const index = galleryEditorCards().indexOf(card);
    const caption = card.querySelector('.compact-field input')?.value.trim();
    if ($('memoryDeleteName')) $('memoryDeleteName').textContent = caption ? `“${caption}”` : `memory ${String(index + 1).padStart(2,'0')}`;
    openModal($('memoryDeleteModal'));
  });
  $('confirmMemoryDelete')?.addEventListener('click', () => {
    if (!pendingGalleryDeleteCard) return;
    pendingGalleryDeleteCard.remove();
    pendingGalleryDeleteCard = null;
    reindexGalleryEditorCards();
    closeModal($('memoryDeleteModal'));
    setCustomizerSaved(false);
    showToast('Memory removed from the edit list ♡ Press Save Changes to publish.', 3600);
  });
  $('cancelMemoryDelete')?.addEventListener('click', () => { pendingGalleryDeleteCard = null; });
  $('cfgMusic')?.addEventListener('change', e => {
    if ($('musicFileStatus')) $('musicFileStatus').textContent = e.target.files?.[0]?.name || (mediaCache.music ? 'Song uploaded ♡' : 'No song uploaded yet');
    setCustomizerSaved(false);
  });
  $('settingsContent')?.addEventListener('input', e => { if (e.target.matches('input:not([type="file"]), textarea')) setCustomizerSaved(false); });

  document.querySelectorAll('.reason-card').forEach(card => card.addEventListener('click', () => {
    $('reasonText').textContent = card.dataset.message || '';
    openModal($('reasonModal'));
  }));
  $('openLetter')?.addEventListener('click', () => openModal($('letterModal')));

  $('openWishModal')?.addEventListener('click', openWishComposer);
  $('emptyAddWishBtn')?.addEventListener('click', openWishComposer);
  $('wishPhoto')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      $('wishPreview').src = reader.result;
      $('wishPreview').hidden = false;
      $('wishPreviewEmpty').hidden = true;
    };
    reader.readAsDataURL(file);
  });
  $('wishForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const submit = e.submitter;
    try {
      if (submit) { submit.disabled = true; submit.textContent = 'Adding…'; }
      await addWishlistItem();
      renderWishlist();
      closeModal($('wishModal'));
      showToast('Added to your wishlist ♡');
    } catch (err) { showToast(err.message || 'Could not add wish.', 4200); }
    finally { if (submit) { submit.disabled = false; submit.textContent = 'Add to wishlist'; } }
  });
  $('wishlistGrid')?.addEventListener('click', e => {
    const button = e.target.closest('[data-delete-wish]');
    if (!button) return;
    const wish = wishlistItems.find(item => item.id === button.dataset.deleteWish);
    if (!wish) return;
    pendingWishDeleteId = wish.id;
    if ($('wishDeleteName')) $('wishDeleteName').textContent = `“${wish.title}”`;
    openModal($('wishDeleteModal'));
  });
  $('confirmWishDelete')?.addEventListener('click', async () => {
    if (!pendingWishDeleteId) return;
    const btn = $('confirmWishDelete');
    try {
      btn.disabled = true;
      await deleteWishlistItem(pendingWishDeleteId);
      renderWishlist();
      closeModal($('wishDeleteModal'));
      showToast('Wish gently removed ♡');
      pendingWishDeleteId = null;
    } catch (err) { showToast(err.message || 'Could not remove wish.', 4500); }
    finally { btn.disabled = false; }
  });
  $('cancelWishDelete')?.addEventListener('click', () => { pendingWishDeleteId = null; });
  $('openWishlistFromCustomizer')?.addEventListener('click', () => {
    closeModal($('customizeModal'));
    setTimeout(() => $('wishlist')?.scrollIntoView({behavior:'smooth', block:'start'}), 150);
  });

  $('musicBtn')?.addEventListener('click', async () => {
    const audio = $('loveSong');
    if (!audio?.src) return showToast('Upload your song from Customize first ♡', 3000);
    try {
      if (audio.paused) { await audio.play(); musicOn=true; $('musicBtn').textContent='❚❚'; showToast('Playing your song ♡'); }
      else { audio.pause(); musicOn=false; $('musicBtn').textContent='♫'; showToast('Music paused'); }
    } catch { showToast('Your browser blocked playback. Tap again ♡', 3000); }
  });
  $('loveSong')?.addEventListener('ended', () => { musicOn=false; $('musicBtn').textContent='♫'; });

  const heartField = document.querySelector('.heart-field');
  const heartChars = ['♡','♥','✦'];
  const spawnHeart = () => {
    if (!heartField) return;
    const el = document.createElement('span');
    el.className='floating-particle';
    el.textContent=heartChars[Math.floor(Math.random()*heartChars.length)];
    el.style.left=Math.random()*100+'vw';
    el.style.fontSize=(10+Math.random()*16)+'px';
    el.style.animationDuration=(9+Math.random()*8)+'s';
    el.style.opacity=(.2+Math.random()*.4).toFixed(2);
    heartField.appendChild(el);
    setTimeout(()=>el.remove(),18000);
  };
  setInterval(spawnHeart,1300);
  $('surpriseBtn')?.addEventListener('click', () => { showToast('You are very loved ♡'); for(let i=0;i<14;i++) setTimeout(spawnHeart,i*65); });
}

function setupRevealObserver() {
  const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('visible'); revealObserver.unobserve(entry.target); }
  }), {threshold:.12});
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
}

async function init() {
  const params = new URLSearchParams(location.search);
  const isLocal = location.protocol === 'file:' || ['localhost','127.0.0.1'].includes(location.hostname);
  if (!isLocal && params.get('edit') !== '1' && $('customizeBtn')) $('customizeBtn').style.display = 'none';
  bindEvents();
  setupMemorySwipe();
  setupRevealObserver();
  try {
    await loadRemoteData();
  } catch (error) {
    console.error('Supabase load failed:', error);
    showToast('Could not reach the online database. Showing the default site.', 4500);
  }
  applyConfig();
  fillForm();
}

init();
