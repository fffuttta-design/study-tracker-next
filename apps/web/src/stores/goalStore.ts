import { create } from 'zustand';
import { subscribeCol, upsertDoc, deleteDocById } from '@study-tracker/firebase';

export type GoalStatus = 'todo' | 'learning' | 'done';
export type GoalPriority = 'high' | 'medium' | 'low';

export interface Goal {
  id: string;
  title: string;
  category: string;
  priority: GoalPriority;
  memo: string;
  status: GoalStatus;
  order: number;
  createdAt: string;
}

function createGoal(params: Pick<Goal, 'title' | 'category' | 'priority' | 'memo' | 'order'>): Goal {
  return {
    id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    status: 'todo',
    createdAt: new Date().toISOString(),
    ...params,
  };
}

interface GoalState {
  goals: Goal[];
  loading: boolean;
  subscribe: (uid: string) => () => void;
  add: (uid: string, params: Pick<Goal, 'title' | 'category' | 'priority' | 'memo'>) => Promise<void>;
  update: (uid: string, id: string, data: Partial<Goal>) => Promise<void>;
  remove: (uid: string, id: string) => Promise<void>;
  reorder: (uid: string, fromIndex: number, toIndex: number, statusFilter: GoalStatus) => Promise<void>;
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

  reorder: async (uid, fromIndex, toIndex, statusFilter) => {
    const { goals, update } = get();
    const filtered = goals.filter((g) => g.status === statusFilter);
    const reordered = [...filtered];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    await Promise.all(
      reordered
        .map((g, i) => ({ goal: g, newOrder: i }))
        .filter(({ goal, newOrder }) => goal.order !== newOrder)
        .map(({ goal, newOrder }) => update(uid, goal.id, { order: newOrder }))
    );
  },
}));
