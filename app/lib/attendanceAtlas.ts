import type { CheckInRecord } from './checkIn';
import { getCancerTypes, type Report } from './reports';
import { resolveVenue, type Venue } from './venueLocations';

export type AttendanceVisit = { record: CheckInRecord; report: Report; venueId: string };
export type AttendanceVenue = {
  id: string; name: string; building: string; floor: number | null;
  regionIds: readonly string[]; status: Venue['status']; visits: AttendanceVisit[];
};
export type AttendanceKeyword = { label: string; count: number; reportIds: number[] };
export type AttendanceLeg = { from: string; to: string; count: number };

const TITLE_KEYWORDS: readonly { label: string; pattern: RegExp }[] = [
  { label: '真实世界研究', pattern: /真实世界|real[\s-]?world|\bRWE\b|\bRWD\b/i },
  { label: '肺癌', pattern: /肺癌|肺腺癌|肺鳞癌|非小细胞肺|\bNSCLC\b|\bSCLC\b|lung\s+cancer/i },
  { label: '乳腺癌', pattern: /乳腺癌|breast\s+cancer/i },
  { label: '结直肠癌', pattern: /结直肠癌|结肠癌|直肠癌|colorectal|\bCRC\b/i },
  { label: '核医学', pattern: /核医学|放射性(?:核素|配体)|radionuclide|radioligand|nuclear\s+medicine/i },
  { label: '分子影像', pattern: /分子影像|\bPET(?:[\s-]?CT)?\b/i },
  { label: '免疫治疗', pattern: /免疫治疗|免疫检查点|immunotherap|checkpoint|\bCAR[\s-]?T\b/i },
  { label: '靶向治疗', pattern: /靶向治疗|targeted\s+therap/i },
  { label: '生物标志物', pattern: /生物标志物|biomarker/i },
  { label: '人工智能', pattern: /人工智能|机器学习|深度学习|artificial\s+intelligence|deep\s+learning/i },
  { label: '围术期', pattern: /围术期|新辅助|perioperative|neoadjuvant/i },
  { label: '临床试验', pattern: /临床试验|随机对照|clinical\s+trial|randomi[sz]ed/i },
];
const keywordCache = new WeakMap<Report, readonly string[]>();

export function reportAttendanceKeywords(report: Report): readonly string[] {
  const cached = keywordCache.get(report);
  if (cached) return cached;
  const labels = new Set(getCancerTypes(report));
  for (const { label, pattern } of TITLE_KEYWORDS) {
    if (pattern.test(report.sourceTitle)) labels.add(label);
  }
  const result = [...labels];
  keywordCache.set(report, result);
  return result;
}

export function buildAttendanceAtlas(records: readonly CheckInRecord[], reports: readonly Report[]) {
  const reportById = new Map(reports.map(report => [report.id, report]));
  const unique = new Map<number, CheckInRecord>();
  const missing = new Set<number>();
  for (const record of records) {
    if (!Number.isInteger(record.reportId) || !Number.isFinite(Date.parse(record.checkedAt))) continue;
    if (!reportById.has(record.reportId)) { missing.add(record.reportId); continue; }
    const existing = unique.get(record.reportId);
    if (!existing || Date.parse(record.checkedAt) < Date.parse(existing.checkedAt)) unique.set(record.reportId, record);
  }
  const ordered = [...unique.values()].sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt) || a.reportId - b.reportId);
  const visits: AttendanceVisit[] = [];
  const venueById = new Map<string, AttendanceVenue>();
  const keywordByLabel = new Map<string, AttendanceKeyword>();
  const legs = new Map<string, AttendanceLeg>();
  const days = new Set<string>();
  let previousVenueId: string | null = null;
  for (const record of ordered) {
    const report = reportById.get(record.reportId)!;
    const resolved = resolveVenue(report.location);
    const venueId = resolved?.id ?? `unknown:${report.location.replace(/\s+/g, '') || 'unannounced'}`;
    const visit = { record, report, venueId };
    visits.push(visit);
    let venue = venueById.get(venueId);
    if (!venue) {
      venue = {
        id: venueId, name: resolved?.name ?? (report.location || '场地未公布'),
        building: resolved?.building ?? '位置待核', floor: resolved?.floor ?? null,
        regionIds: resolved?.regionIds ?? [], status: resolved?.status ?? 'unlocated', visits: [],
      };
      venueById.set(venueId, venue);
    }
    venue.visits.push(visit);
    const day = report.dateTime.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (day) days.add(day);
    for (const label of reportAttendanceKeywords(report)) {
      const keyword = keywordByLabel.get(label);
      if (keyword) { keyword.count++; keyword.reportIds.push(report.id); }
      else keywordByLabel.set(label, { label, count: 1, reportIds: [report.id] });
    }
    if (previousVenueId && previousVenueId !== venueId) {
      const key = JSON.stringify([previousVenueId, venueId]);
      const leg = legs.get(key);
      if (leg) leg.count++;
      else legs.set(key, { from: previousVenueId, to: venueId, count: 1 });
    }
    previousVenueId = venueId;
  }
  const venues = [...venueById.values()].sort((a, b) => b.visits.length - a.visits.length || a.name.localeCompare(b.name, 'zh-CN'));
  const keywords = [...keywordByLabel.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
  const unlocatedCount = visits.reduce((count, visit) => count + Number(!venueById.get(visit.venueId)!.regionIds.length), 0);
  return { visits, venues, keywords, legs: [...legs.values()], total: visits.length, days: days.size, unlocatedCount, missingReportCount: missing.size };
}
