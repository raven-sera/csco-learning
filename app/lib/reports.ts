import rawReports from '../data/reports.raw.json';
import rawShares from '../data/shares.raw.json';
import { publicPath } from './sitePaths';

export type Paper = { title:string; authors:string; journal:string; year:string; pmid:string; doi:string; url:string; abstract?:string; affiliations?:string[]; sameAuthor?:boolean; sameInstitution?:boolean; titleSimilarity?:number; priority?:boolean; priorityReason?:string };
type LiteratureMatch = { id:number; query:string; papers:Paper[] };
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

export type SourceLink = { title:string; url:string; type:'权威概览'|'匹配文献'|'试验登记'|'官方日程'; note?:string; priority?:boolean };
export type ReportKind = '口头报告'|'汇报分享';
export type Report = {
  id:number; kind:ReportKind; scheduleCategory:'主日程'|'专题会'; program:string; session:string;
  abstractNo:string; sourceTitle:string;
  speaker:string; institution:string; dateTime:string; location:string; field:string; directions:string[];
  officialUrl:string; searchAliases:string; papers:Paper[];
};

type FieldContext = { en:string; intro:string; frontier:string; sourceTitle:string; sourceUrl:string; aliases:string };
const genericNci = 'https://www.cancer.gov/types';
const fieldContexts:Record<string,FieldContext> = {
  '肺癌':{en:'Lung cancer',intro:'肺癌首先要按病理类型、分期和可操作分子改变分层；可切除与晚期疾病的治疗目标、终点和证据体系并不相同。',frontier:'当前热点包括围术期免疫治疗、靶向耐药、免疫耐药后的新机制药物，以及用生物标志物减少无效治疗。',sourceTitle:'NCI：非小细胞肺癌治疗（PDQ）',sourceUrl:'https://www.cancer.gov/types/lung/patient/non-small-cell-lung-treatment-pdq',aliases:'feiai fei ai lung nsclc sclc 肺按 肺爱'},
  '结直肠癌':{en:'Colorectal cancer',intro:'结直肠癌的治疗取决于原发部位、分期、可切除性以及 RAS、BRAF、HER2、MSI/MMR 等分子特征。',frontier:'前沿问题集中在免疫敏感人群扩展、分子靶向组合、直肠癌全程新辅助治疗和器官保留。',sourceTitle:'NCI：结肠癌治疗（PDQ）',sourceUrl:'https://www.cancer.gov/types/colorectal/patient/colon-treatment-pdq',aliases:'jiezhichangai jiezhi chang ai colorectal colon rectal 结值肠癌'},
  '乳腺癌':{en:'Breast cancer',intro:'乳腺癌需先按激素受体、HER2 与三阴性亚型分层，早期与转移性疾病的治疗目标不同。',frontier:'热点包括 ADC、CDK4/6 抑制剂后策略、HER2-low/ultralow 分层、免疫治疗和围术期强化或降阶梯。',sourceTitle:'NCI：乳腺癌治疗（PDQ）',sourceUrl:'https://www.cancer.gov/types/breast/patient/breast-treatment-pdq',aliases:'ruxianai ru xian ai breast 乳线癌'},
  '肝癌':{en:'Liver cancer',intro:'肝细胞癌治疗同时受肿瘤负荷、肝功能与体能状态影响，局部治疗和系统治疗常需协同。',frontier:'一线免疫联合、局部与系统治疗整合、术后复发预防以及生物标志物是主要前沿。',sourceTitle:'NCI：成人原发性肝癌治疗（PDQ）',sourceUrl:'https://www.cancer.gov/types/liver/patient/adult-liver-treatment-pdq',aliases:'ganai gan ai liver hcc 肝按'},
  '胃癌':{en:'Gastric cancer',intro:'胃癌需结合分期、HER2、PD-L1、MSI/MMR、CLDN18.2 等标志物选择局部与系统治疗。',frontier:'靶向和免疫联合、围术期治疗优化、分子分层与耐药后的治疗顺序是重点。',sourceTitle:'NCI：胃癌治疗（PDQ）',sourceUrl:'https://www.cancer.gov/types/stomach/patient/stomach-treatment-pdq',aliases:'weiai wei ai gastric stomach 胃按'},
  '食管癌':{en:'Esophageal cancer',intro:'食管癌治疗取决于病理类型、分期和可切除性，放疗、化疗、免疫治疗与手术的时序非常关键。',frontier:'热点是围术期免疫、放疗联合策略、器官保留以及复发转移后的分层治疗。',sourceTitle:'NCI：食管癌治疗（PDQ）',sourceUrl:'https://www.cancer.gov/types/esophageal/patient/esophageal-treatment-pdq',aliases:'shiguanai shi guan ai esophageal 食官癌'},
  '胰腺癌':{en:'Pancreatic cancer',intro:'胰腺癌早期隐匿、复发风险高，可切除性评估与全身治疗强度是决策核心。',frontier:'新辅助策略、分子亚组、免疫微环境重塑和新型药物递送仍是关键研究方向。',sourceTitle:'NCI：胰腺癌治疗（PDQ）',sourceUrl:'https://www.cancer.gov/types/pancreatic/patient/pancreatic-treatment-pdq',aliases:'yixianai yi xian ai pancreatic 胰线癌'},
  '胆道肿瘤':{en:'Biliary tract cancer',intro:'胆道肿瘤包含不同解剖亚型，分子改变谱和手术机会差异明显。',frontier:'免疫联合、FGFR2/IDH1/HER2 等分层靶向和术后治疗证据仍在快速积累。',sourceTitle:'NCI：胆管癌治疗（PDQ）',sourceUrl:'https://www.cancer.gov/types/liver/patient/bile-duct-treatment-pdq',aliases:'dandao dan dao biliary cholangio 胆到肿瘤'},
  '妇科肿瘤':{en:'Gynecologic cancer',intro:'妇科肿瘤涵盖卵巢、宫颈、子宫内膜等疾病，分期、组织学与分子分型共同影响治疗。',frontier:'免疫治疗、PARP 抑制、ADC、分子分型和复发后的精准序贯是主要方向。',sourceTitle:'NCI：妇科肿瘤概览',sourceUrl:'https://www.cancer.gov/types/gynecologic',aliases:'fukezhongliu fu ke gynecologic ovarian cervical endometrial 妇科肿流'},
  '前列腺癌':{en:'Prostate cancer',intro:'前列腺癌需区分局限期、转移性激素敏感和去势抵抗阶段，并关注疾病负荷与分子特征。',frontier:'强化联合、放射性配体治疗、PARP 通路分层和治疗顺序优化是当前热点。',sourceTitle:'NCI：前列腺癌治疗（PDQ）',sourceUrl:'https://www.cancer.gov/types/prostate/patient/prostate-treatment-pdq',aliases:'qianliexianai prostate 前列线癌'},
  '肾癌/尿路上皮癌':{en:'Kidney / urothelial cancer',intro:'肾癌与尿路上皮癌是不同疾病；前者常围绕免疫与抗血管生成，后者还涉及铂类、FGFR 和 ADC。',frontier:'免疫联合、ADC 进入前线、围术期治疗和生物标志物选择是共同热点。',sourceTitle:'NCI：肾细胞癌治疗（PDQ）',sourceUrl:'https://www.cancer.gov/types/kidney/patient/kidney-treatment-pdq',aliases:'shenai niaolu kidney renal urothelial bladder 肾按 尿录'},
  '淋巴瘤':{en:'Lymphoma',intro:'淋巴瘤亚型众多，病理诊断、分期和细胞来源决定治疗，不能把不同亚型的证据直接互换。',frontier:'双特异性抗体、CAR-T、靶向小分子和治疗线次前移正在重塑复发难治疾病。',sourceTitle:'NCI：淋巴瘤',sourceUrl:'https://www.cancer.gov/types/lymphoma',aliases:'linbaliu lin ba liu lymphoma 淋巴流'},
  '白血病/造血干细胞移植':{en:'Leukemia / HSCT',intro:'白血病治疗高度依赖疾病亚型、遗传风险、微小残留病和移植适应证。',frontier:'靶向药、抗体与细胞治疗、MRD 指导决策以及移植后复发预防是核心前沿。',sourceTitle:'NCI：白血病',sourceUrl:'https://www.cancer.gov/types/leukemia',aliases:'baixuebing baixue bing leukemia hsct transplant 白学病'},
  '多发性骨髓瘤':{en:'Multiple myeloma',intro:'骨髓瘤需结合危险分层、移植资格、既往暴露和耐药类别设计连续治疗。',frontier:'CAR-T、双特异性抗体、MRD 指导和高危患者的强化策略进展迅速。',sourceTitle:'NCI：浆细胞肿瘤治疗（PDQ）',sourceUrl:'https://www.cancer.gov/types/myeloma/patient/myeloma-treatment-pdq',aliases:'duofaxinggusuiliu multiple myeloma 骨随瘤'},
  '黑色素瘤':{en:'Melanoma',intro:'黑色素瘤系统治疗以免疫和 BRAF/MEK 靶向为核心，分期与驱动改变决定策略。',frontier:'新辅助免疫、免疫耐药后的组合、细胞治疗和个体化疫苗是前沿。',sourceTitle:'NCI：黑色素瘤治疗（PDQ）',sourceUrl:'https://www.cancer.gov/types/skin/patient/melanoma-treatment-pdq',aliases:'heisesuliu melanoma 黑色数瘤'},
  '甲状腺癌':{en:'Thyroid cancer',intro:'甲状腺癌从惰性分化型到髓样和未分化型差异很大，风险分层与碘难治状态很关键。',frontier:'RET/NTRK/BRAF 等靶向、再分化治疗和局部治疗时机是研究热点。',sourceTitle:'NCI：甲状腺癌治疗（PDQ）',sourceUrl:'https://www.cancer.gov/types/thyroid/patient/thyroid-treatment-pdq',aliases:'jiazhuangxianai thyroid 甲壮线癌'},
  '头颈/鼻咽肿瘤':{en:'Head, neck / nasopharyngeal cancer',intro:'头颈肿瘤需兼顾肿瘤控制与吞咽、发声等功能；鼻咽癌还具有独特的 EBV 相关生物学。',frontier:'放疗精准化、免疫联合、器官功能保留与 EBV 标志物监测是重点。',sourceTitle:'NCI：头颈肿瘤',sourceUrl:'https://www.cancer.gov/types/head-and-neck',aliases:'toujing biyai head neck nasopharyngeal 头劲 鼻炎癌'},
  '骨与软组织肿瘤':{en:'Bone / soft-tissue sarcoma',intro:'肉瘤罕见且异质，病理亚型和多学科局部控制决定治疗，跨亚型外推尤其要谨慎。',frontier:'分子分型、靶向与免疫敏感亚群、保肢和复发难治治疗是主要方向。',sourceTitle:'NCI：软组织肉瘤治疗（PDQ）',sourceUrl:'https://www.cancer.gov/types/soft-tissue-sarcoma/patient/adult-soft-tissue-treatment-pdq',aliases:'gu ruanzuzhi rouliu sarcoma 骨于软组织'},
  '神经内分泌肿瘤':{en:'Neuroendocrine tumor',intro:'神经内分泌肿瘤需区分原发部位、分级、分化程度和受体表达，治疗跨度很大。',frontier:'肽受体放射性核素治疗、靶向药、化疗选择与分子影像分层是重点。',sourceTitle:'NCI：胃肠胰神经内分泌肿瘤（PDQ）',sourceUrl:'https://www.cancer.gov/types/gi-neuroendocrine-tumors/patient/gi-neuroendocrine-treatment-pdq',aliases:'shenjingneifenmi neuroendocrine net 神精内分泌'},
  '放射肿瘤学（泛癌种）':{en:'Radiation oncology',intro:'放射治疗的价值取决于剂量、分割、靶区、器官风险和与系统治疗的时序。',frontier:'精准照射、低分割、粒子治疗、免疫联合和个体化正常组织保护是研究重点。',sourceTitle:'NCI：放射治疗',sourceUrl:'https://www.cancer.gov/about-cancer/treatment/types/radiation-therapy',aliases:'fangliao radiation radiotherapy sb rt 放料'},
  '支持治疗/康复/护理':{en:'Supportive care',intro:'支持治疗覆盖症状控制、营养、康复、心理和治疗不良反应管理，目标是改善生活质量与治疗可持续性。',frontier:'患者报告结局、数字化随访、早期整合和标准化路径是主要方向。',sourceTitle:'NCI：癌症治疗中的支持性照护',sourceUrl:'https://www.cancer.gov/about-cancer/treatment/side-effects',aliases:'zhichiliaohu kangfu huli supportive palliative 支持治料'},
  '患者教育/医疗管理':{en:'Patient education / care delivery',intro:'患者教育和医疗管理研究关注信息能否转化为理解、共同决策、依从性和可及性改善。',frontier:'数字工具、健康素养、真实流程整合和公平性评估是关键。',sourceTitle:'NCI：患者教育材料',sourceUrl:'https://www.cancer.gov/publications/patient-education',aliases:'huanzhejiaoyu yiliao guanli patient education management 患着教育'},
  '肿瘤智慧医疗/数字健康':{en:'Oncology AI / digital health',intro:'肿瘤 AI 不能只看内部准确率，还要评估外部验证、数据偏倚、可解释性和临床工作流中的真实增量。',frontier:'多模态模型、病理与影像基础模型、前瞻性验证和人机协作安全性是前沿。',sourceTitle:'WHO：人工智能促进健康的伦理与治理',sourceUrl:'https://www.who.int/publications/i/item/9789240029200',aliases:'zhihuiyiliao shuzijiankang ai digital health yingxiangzu 智会医疗'},
  '核医学/分子影像':{en:'Nuclear medicine / molecular imaging',intro:'分子影像把靶点表达与全身病灶可视化，可服务分期、疗效评估和诊疗一体化。',frontier:'新示踪剂、放射性配体治疗、剂量学和影像生物标志物验证是热点。',sourceTitle:'NCI：癌症影像',sourceUrl:'https://www.cancer.gov/about-cancer/diagnosis-staging/diagnosis/imaging-tests-fact-sheet',aliases:'heyixue fenziyingxiang pet spect nuclear molecular imaging 核医雪'},
  '肿瘤流行病学/公共卫生':{en:'Cancer epidemiology / public health',intro:'肿瘤流行病学关注人群风险、筛查、负担与不平等，解释关联时要特别警惕偏倚和混杂。',frontier:'真实世界大数据、因果推断、精准预防与卫生政策转化是主要方向。',sourceTitle:'WHO：癌症事实页',sourceUrl:'https://www.who.int/news-room/fact-sheets/detail/cancer',aliases:'liuxingbingxue gonggongweisheng epidemiology public health 流形病学'},
  '泛癌种/新药与转化研究':{en:'Pan-cancer translational oncology',intro:'泛癌种研究常按共同靶点或机制跨越原发部位，但疗效仍可能受组织来源和疾病自然史影响。',frontier:'篮式试验、ADC 与双抗、早期临床试验优化和多组学标志物是热点。',sourceTitle:'NCI：靶向治疗',sourceUrl:'https://www.cancer.gov/about-cancer/treatment/types/targeted-therapies',aliases:'fanai xinyao zhuanhua pan cancer translational new drug 泛癌'},
};

const directionEnglish:Record<string,string> = {
  '临床试验/疗效安全性':'clinical efficacy and safety','免疫治疗':'immunotherapy','靶向/新药研发':'targeted or novel therapy',
  '外科/围术期':'surgery or perioperative treatment','精准分层/生物标志物':'precision stratification and biomarkers',
  '转化机制/多组学':'translational mechanism and multi-omics','真实世界/回顾性/数据库':'real-world or retrospective evidence',
  '放疗技术与联合治疗':'radiotherapy and combination treatment','AI/影像组学/数字医疗':'AI, radiomics and digital health',
  '核医学/分子影像':'nuclear medicine and molecular imaging','支持治疗/康复/护理':'supportive care and rehabilitation',
  '医疗管理/患者教育':'care delivery and patient education','中医药/整合医学':'integrative medicine','临床与转化探索':'clinical and translational exploration'
};

const curatedPapers:Record<number,Paper[]> = {
  1:[{title:'Neoadjuvant nivolumab plus chemotherapy versus chemotherapy for resectable NSCLC: subpopulation analysis of Chinese patients in CheckMate 816',authors:'Wang C, et al.',journal:'ESMO Open',year:'2023',pmid:'37922691',doi:'10.1016/j.esmoop.2023.102040',url:'https://pubmed.ncbi.nlm.nih.gov/37922691/',sameAuthor:true,sameInstitution:true,priority:true,priorityReason:'同报告人、同单位且为 CheckMate 816 中国亚组研究'},{title:'Overall Survival with Neoadjuvant Nivolumab plus Chemotherapy in Lung Cancer',authors:'Forde PM, et al.',journal:'New England Journal of Medicine',year:'2025',pmid:'40454642',doi:'10.1056/NEJMoa2501404',url:'https://pubmed.ncbi.nlm.nih.gov/40454642/'}],
  2:[{title:'Coupling culturomics and metagenomics sequencing to characterize the gut microbiome of patients with cancer treated with immune checkpoint inhibitors',authors:'',journal:'',year:'2025',pmid:'40217292',doi:'',url:'https://pubmed.ncbi.nlm.nih.gov/40217292/'},{title:'Exploring fecal microbiota signatures associated with immune response and antibiotic impact in NSCLC',authors:'',journal:'',year:'2025',pmid:'40792105',doi:'',url:'https://pubmed.ncbi.nlm.nih.gov/40792105/'}],
  3:[{title:'Gotistobart or docetaxel in metastatic squamous non-small cell lung cancer: stage 1 of the randomized phase 3 PRESERVE-003 trial',authors:'',journal:'Nature Medicine',year:'2026',pmid:'41896648',doi:'10.1038/s41591-026-04323-8',url:'https://pubmed.ncbi.nlm.nih.gov/41896648/'}],
  4:[{title:'Clinical outcomes and tumor immune microenvironment in SMARCA4-Deficient NSCLC: A Real-World retrospective study',authors:'Zhao W, et al.',journal:'Lung Cancer',year:'2026',pmid:'42066656',doi:'10.1016/j.lungcan.2026.109414',url:'https://pubmed.ncbi.nlm.nih.gov/42066656/'}],
};
const hasChinese = (text:string) => /[\u3400-\u9fff]/.test(text);
const extractEntities = (title:string) => Array.from(new Set(title.match(/(?:NCT\s*\d{5,8}|[A-Za-z][A-Za-z0-9β-]{2,})/g) ?? []))
  .filter((token) => !/^(the|and|with|from|phase|study|trial|patients?|cancer|therapy|treatment|analysis|results?|based|using|versus|plus|for|in|of|to)$/i.test(token))
  .slice(0,5);

const paperStop = new Set('with without from after before using based study trial phase results analysis patients patient treatment therapy clinical cancer tumor versus plus and the for of in to on by china chinese multicenter randomized prospective retrospective lung breast gastric pancreatic colorectal liver prostate advanced outcomes survival immunotherapy radiotherapy chemotherapy efficacy safety development validation scoring system model models first-line'.split(' '));
function keepRelevantPapers(title:string,papers:Paper[]) {
  const tokens=Array.from(new Set((title.match(/[A-Za-z][A-Za-z0-9-]{3,}/g)??[])
    .map((token)=>token.toLowerCase())
    .filter((token)=>!paperStop.has(token))));
  if (!tokens.length) return [];
  return papers.filter((paper)=>{
    const paperTitle=paper.title.toLowerCase();
    const hits=tokens.filter((token)=>paperTitle.includes(token));
    return hits.length>=2 || hits.some((token)=>token.length>=7 || /\d/.test(token));
  });
}

function mergeReportPapers(id:number,title:string,papers:Paper[]) {
  return Array.from(new Map([
    ...(curatedPapers[id]??[]),
    ...keepRelevantPapers(title,papers),
  ].map((paper)=>[paper.url,paper])).values())
    .sort((a,b)=>Number(Boolean(b.priority))-Number(Boolean(a.priority))||(b.titleSimilarity??0)-(a.titleSimilarity??0))
    .slice(0,3);
}

let literaturePromise:Promise<Map<number,LiteratureMatch>>|null=null;
const reportLiterature = new Map<number, Promise<LiteratureMatch>>();

function loadOneLiterature(id: number) {
  let request = reportLiterature.get(id);
  if (!request) {
    request = fetch(publicPath(`/data/literature/${id}.json`), { cache: 'force-cache' })
      .then(async response => {
        if (!response.ok) throw new Error(`Literature request failed: ${response.status}`);
        const payload = await response.json() as LiteratureMatch;
        if (payload.id !== id || !Array.isArray(payload.papers)) throw new Error('Invalid literature record');
        return payload;
      })
      .catch(error => { reportLiterature.delete(id); throw error; });
    reportLiterature.set(id, request);
  }
  return request;
}

function loadLiterature() {
  if (!literaturePromise) {
    literaturePromise=fetch(publicPath('/data/literature.json'),{cache:'force-cache'})
      .then(async(response)=>{
        if (!response.ok) throw new Error(`Literature request failed: ${response.status}`);
        const payload=await response.json() as LiteratureMatch[];
        return new Map(payload.map((item)=>[item.id,item]));
      })
      .catch((error)=>{
        literaturePromise=null;
        throw error;
      });
  }
  return literaturePromise;
}

export async function loadReportPapers(report:Report) {
  if (report.kind === '汇报分享') return report.papers;
  try {
    if (process.env.NEXT_PUBLIC_LITERATURE_CHUNKS === 'true') {
      const literature = await loadOneLiterature(report.id);
      return mergeReportPapers(report.id, report.sourceTitle, literature.papers);
    }
    const literature=await loadLiterature();
    return mergeReportPapers(report.id,report.sourceTitle,literature.get(report.id)?.papers??[]);
  } catch (error) {
    console.error('Unable to load report literature.',error);
    return report.papers;
  }
}

function titleSearchAlias(raw:RawReport) {
  const context = fieldContexts[raw.聚焦领域] ?? { en:'Oncology',intro:'该研究属于肿瘤学专题，需要结合疾病分期、治疗线次和研究设计理解。',frontier:'重点判断相对现有标准的新增价值。',sourceTitle:'NCI：癌症类型',sourceUrl:genericNci,aliases:'oncology tumor' };
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
  const paperPool=mergeReportPapers(Number(raw.序号),raw.口头报告题目,[]);
  return {
    id:Number(raw.序号),kind:'口头报告',scheduleCategory:'主日程',program:raw.专场,session:raw.Session,
    abstractNo:raw.摘要编号 ? String(raw.摘要编号) : '待公布',sourceTitle:raw.口头报告题目,
    speaker:raw['第一作者/报告人'].replace(/\s+/g,''),institution:raw.报告人单位,
    dateTime:raw['日期/时间'],location:raw.会议地点,field:raw.聚焦领域,
    directions:raw.研究方向.split('；').filter(Boolean),officialUrl:raw.官方日程定位,
    searchAliases:`口头报告 ${raw.专场} ${raw.Session} ${context?.aliases ?? ''} ${context?.en ?? ''} ${generatedTitleAlias} ${extractEntities(raw.口头报告题目).join(' ')}`,
    papers:paperPool.slice(0,3)
  };
});
const shareReports:Report[] = (rawShares as RawShare[]).map((raw) => ({
  id:oralReports.length+Number(raw.序号),kind:'汇报分享',scheduleCategory:raw.日程类别,program:raw.专场,session:raw.Session,
  abstractNo:'非摘要条目',sourceTitle:raw.汇报题目,speaker:raw.汇报人,institution:raw.报告人单位,
  dateTime:raw['日期/时间'],location:raw.会议地点,field:'大会专题',directions:['汇报分享'],
  officialUrl:raw.官方日程定位,
  searchAliases:`汇报分享 ${raw.日程类别} ${raw.专场} ${raw.Session} ${raw.备注}`,
  papers:[],
}));

export const reports:Report[] = [...oralReports,...shareReports];
export const reportKindCounts:Record<ReportKind,number> = {
  口头报告:oralReports.length,
  汇报分享:shareReports.length,
};
export const contentKinds = Object.keys(reportKindCounts) as ReportKind[];
export const fields = Array.from(new Set(reports.map((report) => report.field)));
export const directions = Array.from(new Set(reports.flatMap((report) => report.directions)));

export function sortReportsByDateTime(input:readonly Report[]) {
  return [...input].sort((a,b)=>a.dateTime.localeCompare(b.dateTime,'zh-CN')||a.id-b.id);
}

export function getFieldContext(field:string) {
  return fieldContexts[field] ?? { en:'Oncology',intro:'该专题需要结合疾病分期、治疗线次、患者选择和研究设计理解。',frontier:'重点判断它相对现有标准带来了什么新增证据。',sourceTitle:'NCI：癌症类型',sourceUrl:genericNci,aliases:'oncology' };
}



const norm = (value:string) => value.toLocaleLowerCase().normalize('NFKC').replace(/[^a-z0-9\u3400-\u9fff]+/g,'');
function levenshtein(a:string,b:string) {
  if (!a.length) return b.length; if (!b.length) return a.length;
  const row = Array.from({length:b.length+1},(_,i)=>i);
  for (let i=1;i<=a.length;i++) { let prev=row[0]; row[0]=i; for(let j=1;j<=b.length;j++){ const old=row[j]; row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1)); prev=old; } }
  return row[b.length];
}
const searchIndex = new WeakMap<Report, { hay: string; tokens: string[] }>();
let previousQuery = '', normalizedQuery = '';
export function searchScore(report: Report, query: string) {
  if (query !== previousQuery) { previousQuery = query; normalizedQuery = norm(query); }
  const q = normalizedQuery;
  if (!q) return 1;
  let index = searchIndex.get(report);
  if (!index) {
    index = {
      hay: norm([report.kind,report.scheduleCategory,report.program,report.session,report.sourceTitle,report.speaker,report.institution,report.field,report.directions.join(' '),report.abstractNo,report.searchAliases].join(' ')),
      tokens: Array.from(new Set([report.sourceTitle,report.speaker,report.field,report.searchAliases].join(' ').toLowerCase().split(/[^a-z0-9\u3400-\u9fff]+/).map(norm).filter(Boolean))),
    };
    searchIndex.set(report, index);
  }
  const position = index.hay.indexOf(q);
  if (position >= 0) return 100 - position / 1000;
  if (q.length > 32 || q.length < 2) return 0;
  const threshold = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
  let best = threshold + 1;
  for (const token of index.tokens) {
    if (Math.abs(token.length - q.length) > threshold) continue;
    best = Math.min(best, levenshtein(token, q));
    if (best === 0) break;
  }
  return best <= threshold ? 60 - best : 0;
}

export function getSources(report:Report):SourceLink[] {
  if (report.kind === '汇报分享') {
    return [{title:`2026 CSCO 官方${report.scheduleCategory}日程定位`,url:report.officialUrl,type:'官方日程',note:'核对专场、Session、题目、人员、时间和地点'}];
  }
  const context=getFieldContext(report.field);
  const nct=report.sourceTitle.match(/NCT\s*0*\d{5,8}/i)?.[0]?.replace(/\s/g,'');
  const paperSources=report.papers.slice(0,3).map((paper)=>({title:paper.title,url:paper.url,type:'匹配文献' as const,note:paper.priority?`${paper.priorityReason} · ${paper.journal || '期刊'} · ${paper.year || '年份待核'}`:`${paper.journal || '期刊'} · ${paper.year || '年份待核'}`,priority:paper.priority}));
  const priority=paperSources.filter((source)=>source.priority); const ordinary=paperSources.filter((source)=>!source.priority);
  const overview:SourceLink={title:context.sourceTitle,url:context.sourceUrl,type:'权威概览',note:'用于理解该癌种/专题的通用治疗背景'};
  const sources:SourceLink[]=priority.length?[...priority,overview,...ordinary]:[overview,...ordinary];
  if(nct) sources.push({title:`ClinicalTrials.gov：${nct}`,url:`https://clinicaltrials.gov/study/${nct}`,type:'试验登记',note:'核对研究设计、终点和招募状态'});
  if(report.id===1) sources.push({title:'ClinicalTrials.gov：NCT02998528（CheckMate 816）',url:'https://clinicaltrials.gov/study/NCT02998528',type:'试验登记',note:'核对研究设计、终点与长期随访'});
  sources.push({title:'2026 CSCO 官方口头报告日程定位',url:report.officialUrl,type:'官方日程',note:'核对专场、Session、报告题目、报告人和时间'});
  return sources;
}
