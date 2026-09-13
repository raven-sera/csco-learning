import rawReports from '../data/reports.raw.json';

type RawReport = {
  id:number; 日期:string; 会场:string; 专场名:string; session:string; 主持:string;
  时间:string; 类型:string; 题目:string; 讲者:string; 单位:string; 癌种:string;
};

export type Report = {
  id:number; kind:string; program:string; session:string; chair:string; sourceTitle:string;
  speaker:string; institution:string; dateTime:string; location:string; field:string;
  searchAliases:string;
};

const cancerSearchAliases:Record<string,string> = {
  '肺癌':'feiai fei ai lung cancer nsclc sclc 肺按 肺爱',
  '非小细胞肺癌':'feiai fei ai lung cancer nsclc 肺按 肺爱',
  '小细胞肺癌':'feiai fei ai lung cancer sclc 肺按 肺爱',
  '结直肠癌':'jiezhichangai jiezhi chang ai colorectal colon rectal 结值肠癌',
  '乳腺癌':'ruxianai ru xian ai breast cancer 乳线癌',
  '肝癌':'ganai gan ai liver cancer hcc 肝按',
  '胃癌':'weiai wei ai gastric stomach cancer 胃按',
  '食管癌':'shiguanai shi guan ai esophageal cancer 食官癌',
  '胰腺癌':'yixianai yi xian ai pancreatic cancer 胰线癌',
  '胆道癌':'dandao dan dao biliary cholangio cancer 胆到肿瘤',
  '妇科肿瘤':'fukezhongliu fu ke gynecologic ovarian cervical endometrial 妇科肿流',
  '前列腺癌':'qianliexianai prostate cancer 前列线癌',
  '肾癌':'shenai kidney renal cancer 肾按',
  '尿路上皮癌':'niaolu urothelial bladder cancer 尿录',
  '淋巴瘤':'linbaliu lin ba liu lymphoma 淋巴流',
  '白血病':'baixuebing baixue bing leukemia 白学病',
  '多发性骨髓瘤':'duofaxinggusuiliu multiple myeloma 骨随瘤',
  '黑色素瘤':'heisesuliu melanoma 黑色数瘤',
  '甲状腺癌':'jiazhuangxianai thyroid cancer 甲壮线癌',
  '头颈肿瘤':'toujing head neck cancer 头劲',
  '鼻咽癌':'biyanai nasopharyngeal cancer 鼻炎癌',
  '骨与软组织肿瘤':'gu ruanzuzhi rouliu sarcoma 骨于软组织',
  '神经内分泌肿瘤':'shenjingneifenmi neuroendocrine net 神精内分泌',
};


export function getCancerTypes(report:Pick<Report,'field'>):string[] {
  return report.field.split('；').map(value => value.trim()).filter(Boolean);
}

export const reports:Report[] = (rawReports as RawReport[]).map(raw => {
  const report:Report = {
    id:raw.id,kind:raw.类型,program:raw.专场名,session:raw.session,chair:raw.主持,
    sourceTitle:raw.题目,speaker:raw.讲者,institution:raw.单位,
    dateTime:raw.时间 ? `${raw.日期} ${Number(raw.时间.slice(0,2)) < 12 ? '上午' : '下午'} ${raw.时间}` : `${raw.日期} 时间未注明`,
    location:raw.会场,field:raw.癌种,searchAliases:'',
  };
  report.searchAliases = getCancerTypes(report).map(field => cancerSearchAliases[field] ?? '').join(' ');
  return report;
});
export const fields = Array.from(new Set(reports.flatMap(getCancerTypes))).sort((a,b) => a.localeCompare(b,'zh-CN'));

export function sortReportsByDateTime(input:readonly Report[]) {
  return [...input].sort((a,b)=>a.dateTime.localeCompare(b.dateTime,'zh-CN')||a.id-b.id);
}




const norm = (value:string) => value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g,'');
function levenshtein(a:string,b:string) {
  if (!a.length) return b.length; if (!b.length) return a.length;
  const row = Array.from({length:b.length+1},(_,i)=>i);
  for (let i=1;i<=a.length;i++) { let prev=row[0]; row[0]=i; for(let j=1;j<=b.length;j++){ const old=row[j]; row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1)); prev=old; } }
  return row[b.length];
}
export type SearchMatch = { kind:'exact'|'similar'|'none'; score:number };
const noMatch:SearchMatch = { kind:'none', score:0 };
const browseMatch:SearchMatch = { kind:'exact', score:1 };
const searchIndex = new WeakMap<Report, { fields:string[]; aliases:string; tokens:string[] }>();
let previousQuery = '', normalizedQuery = '', browseQuery = true;
export function searchMatch(report:Report, query:string):SearchMatch {
  if (query !== previousQuery) {
    previousQuery = query;
    normalizedQuery = norm(query);
    browseQuery = !query.trim();
  }
  const q = normalizedQuery;
  if (!q) return browseQuery ? browseMatch : noMatch;
  let index = searchIndex.get(report);
  if (!index) {
    index = {
      fields: [
        report.kind,report.program,report.session,report.sourceTitle,
        ...report.speaker.split('\n'),...report.institution.split('\n'),...report.chair.split('\n'),...getCancerTypes(report),
        report.dateTime,report.location,
      ].map(norm),
      aliases: norm(report.searchAliases),
      tokens: Array.from(new Set([report.sourceTitle,report.speaker,report.field,report.searchAliases].join(' ')
        .normalize('NFKC').toLowerCase().split(/[^a-z0-9\u3400-\u9fff]+/).filter(Boolean))),
    };
    searchIndex.set(report, index);
  }
  // Keep source fields separate: adjoining metadata is not a literal phrase.
  let position = Infinity;
  for (const field of index.fields) {
    const found = field.indexOf(q);
    if (found >= 0) position = Math.min(position, found);
  }
  if (position !== Infinity) return { kind:'exact', score:100 + 1 / (1 + position) };
  const aliasPosition = index.aliases.indexOf(q);
  if (aliasPosition >= 0) return { kind:'similar', score:80 + 1 / (1 + aliasPosition) };
  if (q.length > 32 || q.length < 2) return noMatch;
  const threshold = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
  let best = threshold + 1;
  for (const token of index.tokens) {
    if (Math.abs(token.length - q.length) > threshold) continue;
    best = Math.min(best, levenshtein(token, q));
    if (best === 0) break;
  }
  return best <= threshold ? { kind:'similar', score:60 - best } : noMatch;
}

