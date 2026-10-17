// assets/manifest.json rules: one entry per asset id, immutable updates.
export const GRADES = ['common', 'rare', 'epic', 'legend'];

export function makeEntry({ id, grade, paths, prompt }) {
  if (!id || typeof id !== 'string') throw new Error('id required');
  if (!GRADES.includes(grade)) throw new Error(`grade must be one of ${GRADES.join(',')}`);
  return Object.freeze({ id, grade, paths: { ...paths }, prompt: String(prompt ?? ''), updatedAt: new Date().toISOString() });
}

export function upsertManifest(manifest, entry) {
  const assets = (manifest.assets ?? []).filter(a => a.id !== entry.id).concat(entry);
  return { ...manifest, assets };
}
