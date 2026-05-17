export interface LearningCategory {
  id: string;
  name: string;
  colorValue: number; // 0xAARRGGBB (Flutter Color互換)
  parentId?: string;  // undefined=大カテゴリ
  sortOrder: number;
}

export function categoryLevel(
  cat: LearningCategory,
  all: LearningCategory[]
): 0 | 1 | 2 {
  if (!cat.parentId) return 0;
  const parent = all.find((c) => c.id === cat.parentId);
  if (!parent || !parent.parentId) return 1;
  return 2;
}

export function categoryAndDescendants(
  id: string,
  all: LearningCategory[]
): Set<string> {
  const result = new Set<string>([id]);
  for (const cat of all) {
    if (cat.parentId === id) {
      for (const desc of categoryAndDescendants(cat.id, all)) {
        result.add(desc);
      }
    }
  }
  return result;
}

export function categoryPath(
  cat: LearningCategory,
  all: LearningCategory[]
): string {
  if (!cat.parentId) return cat.name;
  const parent = all.find((c) => c.id === cat.parentId);
  if (!parent) return cat.name;
  return `${categoryPath(parent, all)} › ${cat.name}`;
}

export function colorValueToHex(colorValue: number): string {
  // Flutter の 0xAARRGGBB → CSS の #RRGGBB
  const r = (colorValue >> 16) & 0xff;
  const g = (colorValue >> 8) & 0xff;
  const b = colorValue & 0xff;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
