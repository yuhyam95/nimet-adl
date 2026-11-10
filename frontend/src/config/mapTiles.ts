const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const MAP_TILE_URL = import.meta.env.VITE_MAP_TILE_URL?.trim() || DEFAULT_TILE_URL;
export const MAP_TILE_ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION?.trim() || DEFAULT_ATTRIBUTION;
