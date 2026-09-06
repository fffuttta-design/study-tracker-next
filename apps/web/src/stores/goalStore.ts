import { create } from 'zustand';
import { subscribeCol, upsertDoc, deleteDocById } from '@study-tracker/firebase';

export type GoalStatus = 'todo' | 'learning' | 'done';
export type GoalPriority = 'high' | 'medium' | 'low';

export interface Goal {
  id: string;
  title: string;
  /** @deprecated 2026-09-05にUIから廃止。既存データが持っているだけで画面では使わない */
  category: string;
  /** @deprecated 2026-09-05にUIから廃止。既存データが持っているだけで画面では使わない */
  priority: GoalPriority;
  memo: string;
  /** 'learning' は旧仕様の名残。いまのUIは 'todo'（未完了）と 'done'（完了）だけを使う */
  status: GoalStatus;
  order: number;
  createdAt: string;
}

function createGoal(params: Pick<Goal, 'title' | 'memo' | 'order'>): Goal {
  return {
    id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    status: 'todo',
    category: '',
    priority: 'medium',
    createdAt: new Date().toISOString(),
    ...params,
  };
}

interface GoalState {
  goals: Goal[];
  loading: boolean;
  subscribe: (uid: string) => () => void;
  add: (uid: string, params: Pick<Goal, 'title' | 'memo'>) => Promise<void>;
  update: (uid: string, id: string, data: Partial<Goal>) => Promise<void>;
  remove: (uid: string, id: string) => Promise<void>;
  /** 並び替え：表示順に並べた id の配列を渡すと、その順に order を振り直す */
  reorder: (uid: string, orderedIds: string[]) => Promise<void>;
}

export const useGoalStore = create<GoalState>((set, get) => ({
  goals: [],
  loading: true,

  subscribe: (uid) => {
    return subscribeCol<Goal>(uid, 'goals', (goals) => {
      set({ goals: [...goals].sort((a, b) => a.order - b.order), loading: false });
    });
  },

  add: async (uid, params) => {
    const { goals } = get();
    const maxOrder = goals.length > 0 ? Math.max(...goals.map((g) => g.order)) + 1 : 0;
    const goal = createGoal({ ...params, order: maxOrder });
    await upsertDoc(uid, 'goals', goal.id, goal as unknown as Record<string, unknown>);
  },

  update: async (uid, id, data) => {
    await upsertDoc(uid, 'goals', id, data as Record<string, unknown>);
  },

  remove: async (uid, id) => {
    await deleteDocById(uid, 'goals', id);
  },

  reorder: async (uid, orderedIds) => {
    const { goals, update } = get();
    const byId = new Map(goals.map((g) => [g.id, g]));
    const writes = orderedIds
      .map((id, i) => ({ goal: byId.get(id), newOrder: i }))
      .filter((w): w is { goal: Goal; newOrder: number } => !!w.goal && w.goal.order !== w.newOrder)
      .map(({ goal, newOrder }) => update(uid, goal.id, { order: newOrder }));
    await Promise.all(writes);
  },
}));
