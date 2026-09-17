import type { ModelSpec } from '../utils/modelUtils';
import { CITY_SCALE } from './world';

export const MODEL_URLS = {
  city: '/modelo-3d/cidade-completa.glb',
  player: '/modelo-3d/personagem-principal.glb',
  npcRigged: '/modelo-3d/personagem-segundario.glb',
  npcStatic: '/modelo-3d/personagem-terciario.glb',
  carCommon: '/modelo-3d/carro-comum.glb',
  carSport: '/modelo-3d/carro-esportivo.glb',
  van: '/modelo-3d/van.glb',
  pistol: '/modelo-3d/pistola.glb',
  rifle: '/modelo-3d/ak-47.glb',
  phone: '/modelo-3d/celular.glb',
  money: '/modelo-3d/dinheiro.glb',
} as const;

export type ModelKey = keyof typeof MODEL_URLS;

/** Every GLB in this project ships at a different scale and pivot. */
export const MODEL_SPECS: Record<ModelKey, ModelSpec> = {
  city: {
    url: MODEL_URLS.city,
    uniformScale: CITY_SCALE,
  },
  player: {
    // T-posed Mixamo rig, ~6.39 units tall.
    url: MODEL_URLS.player,
    targetSize: 1.8,
    measureAxis: 'y',
    align: 'bottom',
  },
  npcRigged: {
    // Geometry and skeleton disagree by a rotation on this export: the mesh
    // data lies along Z while the skin renders upright. Measure the geometry's
    // long axis and leave the orientation to the skeleton.
    url: MODEL_URLS.npcRigged,
    targetSize: 1.75,
    measureAxis: 'z',
    align: 'bones',
  },
  npcStatic: {
    url: MODEL_URLS.npcStatic,
    targetSize: 1.75,
    measureAxis: 'y',
    align: 'bottom',
  },
  carCommon: { url: MODEL_URLS.carCommon, align: 'bottom' },
  carSport: {
    url: MODEL_URLS.carSport,
    align: 'bottom',
    // Flat 7x7 fake-shadow quad baked into the Sketchfab export.
    stripNodes: /shadow/i,
  },
  van: { url: MODEL_URLS.van, align: 'bottom', recentreXZ: true },
  pistol: {
    url: MODEL_URLS.pistol,
    // A 2000-unit backdrop plane dwarfs the actual weapon.
    stripNodes: /^Plane001/i,
    targetSize: 0.24,
    measureAxis: 'max',
    align: 'centre',
  },
  rifle: {
    url: MODEL_URLS.rifle,
    targetSize: 0.88,
    measureAxis: 'max',
    align: 'centre',
  },
  phone: { url: MODEL_URLS.phone, targetSize: 0.15, measureAxis: 'y', align: 'centre' },
  money: { url: MODEL_URLS.money, targetSize: 0.34, measureAxis: 'max', align: 'centre' },
};

export const ALL_MODEL_URLS = Object.values(MODEL_URLS);
