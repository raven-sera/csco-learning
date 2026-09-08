import rawReports from '../data/reports.raw.json';
import rawShares from '../data/shares.raw.json';

type RawReport = {
  序号:number; '日期/时间':string; 专场:string; Session:string; 摘要编号:string|null; 口头报告题目:string;
  '第一作者/报告人':string; 报告人单位:string; 通讯作者:string; 聚焦领域:string;
  研究方向:string; '可采访/挖掘点':string; 官方日程定位:string;
  会议地点:string;
};
type RawShare = {
  序号:number; 内容类型:'汇报分享'; 日程类别:'主日程'|'专题会'; '日期/时间':string;
  专场:string; Session:string; 汇报题目:string; 汇报人:string; 报告人单位:string; 会议地点:string;
  官方日程定位:string; 备注:string;
};

export type ReportKind = '口头报告'|'汇报分享';
export type Report = {
  id:number; kind:ReportKind; scheduleCategory:'主日程'|'专题会'; program:string; session:string;
  abstractNo:string; sourceTitle:string;
  speaker:string; institution:string; dateTime:string; location:string; field:string; directions:string[];
  officialUrl:string; searchAliases:string;
};

type FieldContext = { en:string; aliases:string };
const fieldContexts:Record<string,FieldContext> = {
  '肺癌':{en:'Lung cancer',aliases:'feiai fei ai lung nsclc sclc 肺按 肺爱'},
  '结直肠癌':{en:'Colorectal cancer',aliases:'jiezhichangai jiezhi chang ai colorectal colon rectal 结值肠癌'},
  '乳腺癌':{en:'Breast cancer',aliases:'ruxianai ru xian ai breast 乳线癌'},
  '肝癌':{en:'Liver cancer',aliases:'ganai gan ai liver hcc 肝按'},
  '胃癌':{en:'Gastric cancer',aliases:'weiai wei ai gastric stomach 胃按'},
  '食管癌':{en:'Esophageal cancer',aliases:'shiguanai shi guan ai esophageal 食官癌'},
  '胰腺癌':{en:'Pancreatic cancer',aliases:'yixianai yi xian ai pancreatic 胰线癌'},
  '胆道肿瘤':{en:'Biliary tract cancer',aliases:'dandao dan dao biliary cholangio 胆到肿瘤'},
  '妇科肿瘤':{en:'Gynecologic cancer',aliases:'fukezhongliu fu ke gynecologic ovarian cervical endometrial 妇科肿流'},
  '前列腺癌':{en:'Prostate cancer',aliases:'qianliexianai prostate 前列线癌'},
  '肾癌/尿路上皮癌':{en:'Kidney / urothelial cancer',aliases:'shenai niaolu kidney renal urothelial bladder 肾按 尿录'},
  '淋巴瘤':{en:'Lymphoma',aliases:'linbaliu lin ba liu lymphoma 淋巴流'},
  '白血病/造血干细胞移植':{en:'Leukemia / HSCT',aliases:'baixuebing baixue bing leukemia hsct transplant 白学病'},
  '多发性骨髓瘤':{en:'Multiple myeloma',aliases:'duofaxinggusuiliu multiple myeloma 骨随瘤'},
  '黑色素瘤':{en:'Melanoma',aliases:'heisesuliu melanoma 黑色数瘤'},
  '甲状腺癌':{en:'Thyroid cancer',aliases:'jiazhuangxianai thyroid 甲壮线癌'},
  '头颈/鼻咽肿瘤':{en:'Head, neck / nasopharyngeal cancer',aliases:'toujing biyai head neck nasopharyngeal 头劲 鼻炎癌'},
  '骨与软组织肿瘤':{en:'Bone / soft-tissue sarcoma',aliases:'gu ruanzuzhi rouliu sarcoma 骨于软组织'},
  '神经内分泌肿瘤':{en:'Neuroendocrine tumor',aliases:'shenjingneifenmi neuroendocrine net 神精内分泌'},
  '放射肿瘤学（泛癌种）':{en:'Radiation oncology',aliases:'fangliao radiation radiotherapy sb rt 放料'},
  '支持治疗/康复/护理':{en:'Supportive care',aliases:'zhichiliaohu kangfu huli supportive palliative 支持治料'},
  '患者教育/医疗管理':{en:'Patient education / care delivery',aliases:'huanzhejiaoyu yiliao guanli patient education management 患着教育'},
  '肿瘤智慧医疗/数字健康':{en:'Oncology AI / digital health',aliases:'zhihuiyiliao shuzijiankang ai digital health yingxiangzu 智会医疗'},
  '核医学/分子影像':{en:'Nuclear medicine / molecular imaging',aliases:'heyixue fenziyingxiang pet spect nuclear molecular imaging 核医雪'},
  '肿瘤流行病学/公共卫生':{en:'Cancer epidemiology / public health',aliases:'liuxingbingxue gonggongweisheng epidemiology public health 流形病学'},
  '泛癌种/新药与转化研究':{en:'Pan-cancer translational oncology',aliases:'fanai xinyao zhuanhua pan cancer translational new drug 泛癌'},
};

const directionEnglish:Record<string,string> = {
  '临床试验/疗效安全性':'clinical efficacy and safety','免疫治疗':'immunotherapy','靶向/新药研发':'targeted or novel therapy',
  '外科/围术期':'surgery or perioperative treatment','精准分层/生物标志物':'precision stratification and biomarkers',
  '转化机制/多组学':'translational mechanism and multi-omics','真实世界/回顾性/数据库':'real-world or retrospective evidence',
  '放疗技术与联合治疗':'radiotherapy and combination treatment','AI/影像组学/数字医疗':'AI, radiomics and digital health',
  '核医学/分子影像':'nuclear medicine and molecular imaging','支持治疗/康复/护理':'supportive care and rehabilitation',
  '医疗管理/患者教育':'care delivery and patient education','中医药/整合医学':'integrative medicine','临床与转化探索':'clinical and translational exploration'
};

const hasChinese = (text:string) => /[\u3400-\u9fff]/.test(text);
const extractEntities = (title:string) => Array.from(new Set(title.match(/(?:NCT\s*\d{5,8}|[A-Za-z][A-Za-z0-9β-]{2,})/g) ?? []))
  .filter((token) => !/^(the|and|with|from|phase|study|trial|patients?|cancer|therapy|treatment|analysis|results?|based|using|versus|plus|for|in|of|to)$/i.test(token))
  .slice(0,5);


function titleSearchAlias(raw:RawReport) {
  const context = fieldContexts[raw.聚焦领域] ?? {en:'Oncology',aliases:'oncology tumor'};
  const directions = raw.研究方向.split('；').filter(Boolean);
  const entities = extractEntities(raw.口头报告题目);
  if (hasChinese(raw.口头报告题目)) {
    return `${context.en}: ${directions.slice(0,2).map((d) => directionEnglish[d] ?? d).join(' + ')}${entities.length ? ` — ${entities.join(', ')}` : ''}`;
  }
  const entityText = entities.length ? `，涉及 ${entities.join('、')}` : '';
  return `${raw.聚焦领域}：${directions.slice(0,2).join('与')}${entityText}`;
}

const oralReports:Report[] = (rawReports as RawReport[]).map((raw) => {
  const generatedTitleAlias = titleSearchAlias(raw);
  const context = fieldContexts[raw.聚焦领域];
  return {
    id:Number(raw.序号),kind:'口头报告',scheduleCategory:'主日程',program:raw.专场,session:raw.Session,
    abstractNo:raw.摘要编号 ? String(raw.摘要编号) : '待公布',sourceTitle:raw.口头报告题目,
    speaker:raw['第一作者/报告人'].replace(/\s+/g,''),institution:raw.报告人单位,
    dateTime:raw['日期/时间'],location:raw.会议地点,field:raw.聚焦领域,
    directions:raw.研究方向.split('；').filter(Boolean),officialUrl:raw.官方日程定位,
    searchAliases:`口头报告 ${raw.专场} ${raw.Session} ${context?.aliases ?? ''} ${context?.en ?? ''} ${generatedTitleAlias} ${extractEntities(raw.口头报告题目).join(' ')}`
  };
});
const shareReports:Report[] = (rawShares as RawShare[]).map((raw) => ({
  id:oralReports.length+Number(raw.序号),kind:'汇报分享',scheduleCategory:raw.日程类别,program:raw.专场,session:raw.Session,
  abstractNo:'非摘要条目',sourceTitle:raw.汇报题目,speaker:raw.汇报人,institution:raw.报告人单位,
  dateTime:raw['日期/时间'],location:raw.会议地点,field:'大会专题',directions:['汇报分享'],
  officialUrl:raw.官方日程定位,
  searchAliases:`汇报分享 ${raw.日程类别} ${raw.专场} ${raw.Session} ${raw.备注}`,
}));

export const reports:Report[] = [...oralReports,...shareReports];
export const reportKindCounts:Record<ReportKind,number> = {
  口头报告:oralReports.length,
  汇报分享:shareReports.length,
};
export const contentKinds = Object.keys(reportKindCounts) as ReportKind[];
export const fields = Array.from(new Set(reports.map((report) => report.field)));
export const directions = Array.from(new Set(reports.flatMap((report) => report.directions)));

const dateTimeCollator = new Intl.Collator('zh-CN');

export function sortReportsByDateTime(input:readonly Report[]) {
  return [...input].sort((a,b)=>dateTimeCollator.compare(a.dateTime,b.dateTime)||a.id-b.id);
}




const norm = (value:string) => value.toLocaleLowerCase().normalize('NFKC').replace(/[^a-z0-9\u3400-\u9fff]+/g,'');
// Fuzzy queries are at most 32 characters and permit at most three edits.
// Calls are synchronous, so every token comparison can reuse the same row.
const distanceRow = new Uint8Array(33);
function boundedLevenshtein(a:string,b:string,limit:number) {
  if (Math.abs(a.length-b.length) > limit) return limit+1;
  const row = distanceRow;
  const outside = limit+1;
  row.fill(outside,0,b.length+1);
  for (let j=0;j<=Math.min(b.length,limit);j++) row[j]=j;
  for (let i=1;i<=a.length;i++) {
    const start = Math.max(1,i-limit);
    const end = Math.min(b.length,i+limit);
    let diagonal = row[start-1];
    row[start-1] = start === 1 ? Math.min(i,outside) : outside;
    let minimum = outside;
    for (let j=start;j<=end;j++) {
      const above = row[j];
      row[j] = Math.min(above+1,row[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));
      diagonal = above;
      minimum = Math.min(minimum,row[j]);
    }
    if (minimum > limit) return outside;
    if (end < b.length) row[end+1]=outside;
  }
  return row[b.length];
}
const searchIndex = new WeakMap<Report, { hay: string; tokensByLength: string[][] }>();
let previousQuery = '', normalizedQuery = '';
export function searchScore(report: Report, query: string) {
  if (query !== previousQuery) { previousQuery = query; normalizedQuery = norm(query); }
  const q = normalizedQuery;
  if (!q) return 1;
  let index = searchIndex.get(report);
  if (!index) {
    const tokensByLength:string[][] = [];
    // Keep the original split-before-normalize order, including fullwidth handling.
    const tokens = new Set([report.sourceTitle,report.speaker,report.field,report.searchAliases].join(' ').toLowerCase().split(/[^a-z0-9\u3400-\u9fff]+/).map(norm));
    for (const token of tokens) {
      if (!token.length || token.length > 35) continue;
      (tokensByLength[token.length] ??= []).push(token);
    }
    index = {
      hay: norm([report.kind,report.scheduleCategory,report.program,report.session,report.sourceTitle,report.speaker,report.institution,report.field,report.directions.join(' '),report.abstractNo,report.searchAliases].join(' ')),
      tokensByLength,
    };
    searchIndex.set(report, index);
  }
  const position = index.hay.indexOf(q);
  if (position >= 0) return 100 - position / 1000;
  if (q.length > 32 || q.length < 2) return 0;
  const threshold = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
  let best = threshold + 1;
  for (let length=Math.max(1,q.length-threshold);length<=q.length+threshold;length++) {
    if (Math.abs(length-q.length) >= best) continue;
    const tokens = index.tokensByLength[length];
    if (!tokens) continue;
    for (const token of tokens) {
      best = Math.min(best,boundedLevenshtein(token,q,best-1));
      if (best === 0) return 60;
    }
  }
  return best <= threshold ? 60 - best : 0;
}

