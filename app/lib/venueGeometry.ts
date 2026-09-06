import geometryData from '../data/venue-map.json';

export type MapPoint = readonly [number, number];
export type MapPolygon = readonly MapPoint[];
export type MapRoomKind = 'main' | 'hall' | 'meeting' | 'vip' | 'public';

export type MapFloor = {
  title: string;
  source: string;
  width: number;
  height: number;
  outline: MapPolygon;
  voids: readonly MapPolygon[];
  extras: readonly MapPolygon[];
};

export type MapRoom = {
  id: string;
  floor: 1 | 2;
  name: string;
  english: string;
  kind: MapRoomKind;
  polygon: MapPolygon;
  note: string;
};

export type MapGeometry = {
  floors: { '1': MapFloor; '2': MapFloor };
  rooms: readonly MapRoom[];
  categories: Record<MapRoomKind, { label: string; color: string }>;
  entrance: { floor: 1; pixel: MapPoint };
};

// Hand-traced illustration from the supplied images, not surveyed geometry.
// Only the lazy map component should import this module.
// JSON inference widens coordinate tuples; test:venues checks the geometry boundary.
export const mapGeometry = geometryData as unknown as MapGeometry;

export function projectMapPoint(floor: 1 | 2, point: readonly [number, number]): [number, number] {
  let [px, py] = point;
  if (floor === 2) {
    // Three corresponding Movie Hall corners align the illustrations only;
    // this does not establish actual floor alignment or a vertical connection.
    const x = px, y = py;
    px = 248 + (16723 * (x - 215) + 2907 * (y - 310)) / 17083;
    py = 280 + (279 * (x - 215) + 14403 * (y - 310)) / 17083;
  }
  const dx = px - 470, dy = py - 350;
  return [
    ((0.64 * dx - 0.85 * dy) / 1.0055) * 0.12,
    ((dy + 0.43 * dx) / 1.0055) * 0.12,
  ];
}
