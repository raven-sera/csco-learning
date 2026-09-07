import { deferred } from './deferred';
const NOTES_DATABASE = 'csco-report-notes';
const NOTES_STORE = 'notes';
const RECORDINGS_STORE = 'recordings';
const SLIDES_STORE = 'slides';
const LEGACY_NOTE_KEY = 'csco-report-note-';
const FALLBACK_NOTE_KEY = 'csco-report-note-html-';

type NoteRecord = {
  reportId: number;
  html: string;
  updatedAt: number;
  legacyFallback?: boolean;
};

export type StoredRecording = {
  id: string;
  reportId: number;
  title: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
  createdAt: number;
};

export type StoredSlide = {
  id: string;
  reportId: number;
  name: string;
  original: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  createdAt: number;
  order: number;
  processed?: Blob;
  processedThumbnail?: Blob;
  mode: 'original' | 'processed';
};

let notesDatabasePromise: Promise<IDBDatabase> | null = null;

function requestResult<T>(request: IDBRequest<T>) {
  const { promise, resolve, reject } = deferred<T>();
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  return promise;
}

function transactionComplete(transaction: IDBTransaction) {
  const { promise, resolve, reject } = deferred<void>();
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
  return promise;
}

function openNotesDatabase() {
  if (notesDatabasePromise) return notesDatabasePromise;
  const { promise, resolve, reject } = deferred<IDBDatabase>();
  notesDatabasePromise = promise;
  let blocked = false;
  const request = indexedDB.open(NOTES_DATABASE, 2);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(NOTES_STORE)) {
      database.createObjectStore(NOTES_STORE, { keyPath: 'reportId' });
    }
    if (!database.objectStoreNames.contains(RECORDINGS_STORE)) {
      const store = database.createObjectStore(RECORDINGS_STORE, { keyPath: 'id' });
      store.createIndex('reportId', 'reportId');
    }
    if (!database.objectStoreNames.contains(SLIDES_STORE)) {
      const store = database.createObjectStore(SLIDES_STORE, { keyPath: 'id' });
      store.createIndex('reportId', 'reportId');
    }
  };
  request.onsuccess = () => {
    const database = request.result;
    if (blocked) { database.close(); return; }
    database.onversionchange = () => { database.close(); notesDatabasePromise = null; };
    database.onclose = () => { notesDatabasePromise = null; };
    resolve(database);
  };
  request.onerror = () => reject(request.error ?? new Error('Unable to open note storage.'));
  request.onblocked = () => {
    blocked = true;
    reject(new Error('请关闭其他已打开的 CSCO 页面，再重试载入本机资料。'));
  };
  void notesDatabasePromise.catch(() => {
    notesDatabasePromise = null;
  });
  return notesDatabasePromise;
}

async function readNoteRecord(reportId: number) {
  const database = await openNotesDatabase();
  const transaction = database.transaction(NOTES_STORE, 'readonly');
  return requestResult(transaction.objectStore(NOTES_STORE).get(reportId)) as Promise<NoteRecord | undefined>;
}

async function writeNoteRecord(record: NoteRecord) {
  const database = await openNotesDatabase();
  const transaction = database.transaction(NOTES_STORE, 'readwrite');
  transaction.objectStore(NOTES_STORE).put(record);
  await transactionComplete(transaction);
}

export async function readRecordingRecords(reportId: number) {
  const database = await openNotesDatabase();
  const transaction = database.transaction(RECORDINGS_STORE, 'readonly');
  const index = transaction.objectStore(RECORDINGS_STORE).index('reportId');
  const records = await requestResult(index.getAll(IDBKeyRange.only(reportId))) as StoredRecording[];
  return records.sort((left, right) => left.createdAt - right.createdAt);
}

export async function writeRecordingRecord(record: StoredRecording) {
  const database = await openNotesDatabase();
  const transaction = database.transaction(RECORDINGS_STORE, 'readwrite');
  transaction.objectStore(RECORDINGS_STORE).put(record);
  await transactionComplete(transaction);
}

export async function removeRecordingRecord(id: string) {
  const database = await openNotesDatabase();
  const transaction = database.transaction(RECORDINGS_STORE, 'readwrite');
  transaction.objectStore(RECORDINGS_STORE).delete(id);
  await transactionComplete(transaction);
}

export async function readSlideRecords(reportId: number): Promise<StoredSlide[]> {
  const database = await openNotesDatabase();
  const transaction = database.transaction(SLIDES_STORE, 'readonly');
  const index = transaction.objectStore(SLIDES_STORE).index('reportId');
  const records = await requestResult(index.getAll(IDBKeyRange.only(reportId))) as StoredSlide[];
  return records.sort((left, right) => left.order - right.order || left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}

export async function writeSlideRecords(records: StoredSlide[]): Promise<void> {
  if (!records.length) return;
  const database = await openNotesDatabase();
  const transaction = database.transaction(SLIDES_STORE, 'readwrite');
  const completed = transactionComplete(transaction);
  try {
    const store = transaction.objectStore(SLIDES_STORE);
    for (const record of records) store.put(record);
  } catch (error) {
    transaction.abort();
    await completed.catch(() => {});
    throw error;
  }
  await completed;
}

export async function removeSlideRecord(id: string): Promise<void> {
  const database = await openNotesDatabase();
  const transaction = database.transaction(SLIDES_STORE, 'readwrite');
  transaction.objectStore(SLIDES_STORE).delete(id);
  await transactionComplete(transaction);
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function plainTextToHtml(value: string) {
  const paragraphs = value.split(/\n{2,}/).map((paragraph) => (
    `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`
  ));
  return paragraphs.join('') || '<p></p>';
}

function fallbackRecord(reportId: number): NoteRecord | undefined {
  const value = localStorage.getItem(`${FALLBACK_NOTE_KEY}${reportId}`);
  if (!value) return undefined;
  try {
    const record = JSON.parse(value);
    if (typeof record.html === 'string' && Number.isFinite(record.updatedAt)) return {reportId, html: record.html, updatedAt: record.updatedAt};
  } catch { /* Prior versions stored raw HTML. */ }
  return {reportId, html:value, updatedAt:0, legacyFallback:true};
}

export async function loadStoredNote(reportId: number) {
  let primary: NoteRecord | undefined, fallback: NoteRecord | undefined;
  let primaryReadable = false, fallbackReadable = false;
  try { primary = await readNoteRecord(reportId); primaryReadable = true; } catch { /* use fallback */ }
  try { fallback = fallbackRecord(reportId); fallbackReadable = true; } catch { /* primary still works */ }
  if (fallback && (fallback.legacyFallback || !primary || fallback.updatedAt >= primary.updatedAt)) return {...fallback, migrated:true};
  if (primary) return {...primary, migrated:false};
  if (!primaryReadable && !fallbackReadable) throw new Error('Note storage is unavailable.');
  let legacy = '';
  try { legacy = localStorage.getItem(`${LEGACY_NOTE_KEY}${reportId}`) ?? ''; } catch { /* no readable legacy data */ }
  return { reportId, html:plainTextToHtml(legacy), updatedAt:0, migrated:Boolean(legacy) };
}

let lastTimestamp = 0;
const nextTimestamp = () => (lastTimestamp = Math.max(Date.now(), lastTimestamp + 1));

export function stageStoredNote(reportId: number, html: string) {
  const record = { reportId, html, updatedAt:nextTimestamp() };
  localStorage.setItem(`${FALLBACK_NOTE_KEY}${reportId}`, JSON.stringify(record));
  return record;
}

const pendingSaves = new Map<number, Promise<unknown>>();
export function persistStoredNote(reportId: number, html: string) {
  const record = { reportId, html, updatedAt:nextTimestamp() };
  const operation = (pendingSaves.get(reportId) ?? Promise.resolve()).catch(() => {}).then(async () => {
    try {
      await writeNoteRecord(record);
    } catch {
      // A successful fallback is a save; if both stores fail, reject to the UI.
      const fallback = fallbackRecord(reportId);
      if (!fallback || fallback.legacyFallback || fallback.updatedAt <= record.updatedAt) {
        localStorage.setItem(`${FALLBACK_NOTE_KEY}${reportId}`, JSON.stringify(record));
      }
      return record.updatedAt;
    }
    try {
      const fallback = fallbackRecord(reportId);
      if (!fallback || fallback.legacyFallback || fallback.updatedAt <= record.updatedAt) localStorage.removeItem(`${FALLBACK_NOTE_KEY}${reportId}`);
      localStorage.removeItem(`${LEGACY_NOTE_KEY}${reportId}`);
    } catch { /* Cleanup failure cannot turn a committed IDB write into a failed save. */ }
    return record.updatedAt;
  });
  pendingSaves.set(reportId, operation);
  void operation.then(() => { if (pendingSaves.get(reportId) === operation) pendingSaves.delete(reportId); }, () => { if (pendingSaves.get(reportId) === operation) pendingSaves.delete(reportId); });
  return operation;
}
