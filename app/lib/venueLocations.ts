export type VenueStatus = 'mapped' | 'combined' | 'unlocated' | 'uncovered';

export type Venue = {
  id: string;
  name: string;
  building: string;
  floor: 1 | 2 | 3 | 4 | null;
  regionIds: readonly string[];
  status: VenueStatus;
  note: string;
};

// Keep schedule lookups independent of map geometry, runtime assets and report data.
export const venues: readonly Venue[] = [
  {"id":"sd-f1-shandong","name":"山东会堂","building":"山东大厦","floor":1,"regionIds":["f1-shandong"],"status":"mapped","note":"一层原图标注「主会场」。具体活动安排以当届会议通知为准。"},
  {"id":"sd-f1-movie","name":"影视会议厅","building":"山东大厦","floor":1,"regionIds":["f1-movie"],"status":"mapped","note":""},
  {"id":"sd-f1-qilu","name":"齐鲁厅","building":"山东大厦","floor":1,"regionIds":["f1-qilu"],"status":"mapped","note":""},
  {"id":"sd-f1-finance","name":"山东财金厅","building":"山东大厦","floor":1,"regionIds":["f1-finance"],"status":"mapped","note":""},
  {"id":"sd-f1-taishan","name":"泰山厅","building":"山东大厦","floor":1,"regionIds":["f1-taishan"],"status":"mapped","note":""},
  {"id":"sd-f1-luneng","name":"鲁能厅","building":"山东大厦","floor":1,"regionIds":["f1-luneng"],"status":"mapped","note":""},
  {"id":"sd-f1-evergreen","name":"青未了厅","building":"山东大厦","floor":1,"regionIds":["f1-evergreen"],"status":"mapped","note":""},
  {"id":"sd-f1-rizhao","name":"日照厅","building":"山东大厦","floor":1,"regionIds":["f1-rizhao"],"status":"mapped","note":""},
  {"id":"sd-f1-weihai","name":"威海厅","building":"山东大厦","floor":1,"regionIds":["f1-weihai"],"status":"mapped","note":""},
  {"id":"sd-f1-linyi","name":"临沂厅","building":"山东大厦","floor":1,"regionIds":["f1-linyi"],"status":"mapped","note":""},
  {"id":"sd-f1-dezhou","name":"德州厅","building":"山东大厦","floor":1,"regionIds":["f1-dezhou"],"status":"mapped","note":""},
  {"id":"sd-f1-renhe","name":"仁和厅","building":"山东大厦","floor":1,"regionIds":["f1-renhe"],"status":"mapped","note":""},
  {"id":"sd-f1-haidai","name":"海岱厅","building":"山东大厦","floor":1,"regionIds":["f1-haidai"],"status":"mapped","note":""},
  {"id":"sd-f1-golden","name":"金色大厅","building":"山东大厦","floor":1,"regionIds":["f1-golden"],"status":"mapped","note":"一、二层图均标注金色大厅；层间关系与实际门位待现场确认。"},
  {"id":"sd-f1-kongshan","name":"孔膳厅","building":"山东大厦","floor":1,"regionIds":["f1-kongshan"],"status":"mapped","note":""},
  {"id":"sd-f1-heze","name":"菏泽厅","building":"山东大厦","floor":1,"regionIds":["f1-heze"],"status":"mapped","note":""},
  {"id":"sd-f1-binzhou","name":"滨州厅","building":"山东大厦","floor":1,"regionIds":["f1-binzhou"],"status":"mapped","note":""},
  {"id":"sd-f1-liaocheng","name":"聊城厅","building":"山东大厦","floor":1,"regionIds":["f1-liaocheng"],"status":"mapped","note":"原图备注「聊城厅（试片室）」。"},
  {"id":"sd-f2-movie","name":"影视会议厅二层","building":"山东大厦","floor":2,"regionIds":["f2-movie"],"status":"mapped","note":"原图标注为影视会议厅二层；本模型不推定其与一层的挑空或看台结构。"},
  {"id":"sd-f2-zhonghua","name":"中华厅","building":"山东大厦","floor":2,"regionIds":["f2-zhonghua"],"status":"mapped","note":""},
  {"id":"sd-f2-luxin","name":"鲁信贵宾厅","building":"山东大厦","floor":2,"regionIds":["f2-luxin"],"status":"mapped","note":""},
  {"id":"sd-f2-huanghe","name":"黄河厅","building":"山东大厦","floor":2,"regionIds":["f2-huanghe"],"status":"mapped","note":""},
  {"id":"sd-f2-quehua","name":"鹊华厅","building":"山东大厦","floor":2,"regionIds":["f2-quehua"],"status":"mapped","note":""},
  {"id":"sd-f2-luoyuan","name":"泺源厅","building":"山东大厦","floor":2,"regionIds":["f2-luoyuan"],"status":"mapped","note":""},
  {"id":"sd-f2-haiyou","name":"海右厅","building":"山东大厦","floor":2,"regionIds":["f2-haiyou"],"status":"mapped","note":""},
  {"id":"sd-f2-zibo","name":"淄博厅","building":"山东大厦","floor":2,"regionIds":["f2-zibo"],"status":"mapped","note":""},
  {"id":"sd-f2-zaozhuang","name":"枣庄厅","building":"山东大厦","floor":2,"regionIds":["f2-zaozhuang"],"status":"mapped","note":""},
  {"id":"sd-f2-dongying","name":"东营厅","building":"山东大厦","floor":2,"regionIds":["f2-dongying"],"status":"mapped","note":""},
  {"id":"sd-f2-yantai","name":"烟台厅","building":"山东大厦","floor":2,"regionIds":["f2-yantai"],"status":"mapped","note":""},
  {"id":"sd-f2-renhe","name":"仁和厅区域","building":"山东大厦","floor":2,"regionIds":["f2-renhe"],"status":"mapped","note":"二层原图标注「Renhe Hall」。此处仅保留图面区域，是否为挑空或独立可达空间待核实。"},
  {"id":"sd-f2-jinan","name":"济南厅","building":"山东大厦","floor":2,"regionIds":["f2-jinan"],"status":"mapped","note":""},
  {"id":"sd-f2-qingdao","name":"青岛厅","building":"山东大厦","floor":2,"regionIds":["f2-qingdao"],"status":"mapped","note":""},
  {"id":"sd-f2-golden","name":"金色大厅","building":"山东大厦","floor":2,"regionIds":["f2-golden"],"status":"mapped","note":"一、二层图均标注金色大厅；层间关系与实际门位待现场确认。"},
  {"id":"sd-f2-news","name":"山东省新闻中心","building":"山东大厦","floor":2,"regionIds":["f2-news"],"status":"mapped","note":""},
  {"id":"sd-f2-jining","name":"济宁厅","building":"山东大厦","floor":2,"regionIds":["f2-jining"],"status":"mapped","note":""},
  {"id":"sd-f2-weifang","name":"潍坊厅","building":"山东大厦","floor":2,"regionIds":["f2-weifang"],"status":"mapped","note":""},
  {"id":"sd-f2-haiyou-luoyuan","name":"海右泺源厅","building":"山东大厦","floor":2,"regionIds":["f2-haiyou","f2-luoyuan"],"status":"combined","note":"官方日程合称「海右泺源厅」，对应原图分别标注的海右厅与泺源厅两片区域；确切分隔、合并使用方式与门位尚未核实，请以现场指引为准。"},
  {"id":"sd-f1-zhongtai","name":"中泰证券厅","building":"山东大厦","floor":1,"regionIds":[],"status":"unlocated","note":"官方日程列为山东大厦一层会场；所提供平面图未标注同名区域，不能确认其位置，请向会务组或现场工作人员查询。"},
  {"id":"sd-f2-taian","name":"泰安厅","building":"山东大厦","floor":2,"regionIds":[],"status":"unlocated","note":"官方日程列为山东大厦二层会场；所提供平面图未标注同名区域，不能确认其位置；请勿与一层泰山厅混同。"},
  {"id":"nj-club-f1-auditorium","name":"大礼堂","building":"南郊宾馆俱乐部","floor":1,"regionIds":[],"status":"uncovered","note":"该会场位于南郊宾馆，现有山东大厦一、二层平面图不覆盖此处；请查看官方会务指引。"},
  {"id":"nj-club-f1-meeting","name":"会议厅","building":"南郊宾馆俱乐部","floor":1,"regionIds":[],"status":"uncovered","note":"该会场位于南郊宾馆，现有山东大厦一、二层平面图不覆盖此处；请查看官方会务指引。"},
  {"id":"nj-club-f3-multifunction","name":"多功能厅","building":"南郊宾馆俱乐部","floor":3,"regionIds":[],"status":"uncovered","note":"该会场位于南郊宾馆，现有山东大厦一、二层平面图不覆盖此处；请查看官方会务指引。"},
  {"id":"nj-club-f4-auditorium","name":"小礼堂","building":"南郊宾馆俱乐部","floor":4,"regionIds":[],"status":"uncovered","note":"该会场位于南郊宾馆，现有山东大厦一、二层平面图不覆盖此处；请查看官方会务指引。"},
  {"id":"nj-hotel-f1-1011","name":"1011会议室","building":"南郊宾馆","floor":1,"regionIds":[],"status":"uncovered","note":"该会场位于南郊宾馆，现有山东大厦一、二层平面图不覆盖此处；请查看官方会务指引。"},
  {"id":"nj-hotel-f1-1001","name":"1001会议室","building":"南郊宾馆","floor":1,"regionIds":[],"status":"uncovered","note":"该会场位于南郊宾馆，现有山东大厦一、二层平面图不覆盖此处；请查看官方会务指引。"},
];

const floorNames = { 1: '一层', 2: '二层', 3: '三层', 4: '四层' } as const;
const byId = new Map(venues.map(venue => [venue.id, venue]));

function normalizeLocation(location: string): string {
  // The official data uses 一楼 once; do not infer other room or building aliases.
  return location.replace(/\s+/gu, '').replace('一楼', '一层');
}

const byLocation = new Map(venues.map(venue => [
  normalizeLocation(venue.building + (venue.floor === null ? '' : floorNames[venue.floor]) + venue.name),
  venue,
]));

export function resolveVenue(location: string): Venue | null {
  return byLocation.get(normalizeLocation(location)) ?? null;
}

export function getVenueById(id: string): Venue | undefined {
  return byId.get(id);
}
