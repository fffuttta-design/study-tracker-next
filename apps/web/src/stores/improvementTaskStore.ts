import { create } from 'zustand';
import { subscribeCol, upsertDoc, deleteDocById } from '@study-tracker/firebase';

export interface ImprovementTask {
  id: string;
  name: string;
  detail: string;
  completed: boolean;
  order: number;
  createdAt: string;
}

function createTask(params: { name: string; detail: string; order: number }): ImprovementTask {
  return {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: params.name,
    detail: params.detail,
    completed: false,
    order: params.order,
    createdAt: new Date().toISOString(),
  };
}

interface ImprovementTaskState {
  tasks: ImprovementTask[];
  loading: boolean;
  subscribe: (uid: string) => () => void;
  add: (uid: string, name: string, detail: string) => Promise<void>;
  update: (uid: string, id: string, data: Partial<ImprovementTask>) => Promise<void>;
  remove: (uid: string, id: string) => Promise<void>;
  reorder: (uid: string, fromIndex: number, toIndex: number) => Promise<void>;
}

export const useImprovementTaskStore = create<ImprovementTaskState>((set, get) => ({
  tasks: [],
  loading: true,

  subscribe: (uid) => {
    return subscribeCol<ImprovementTask>(uid, 'improvementTasks', (tasks) => {
      set({
        tasks: [...tasks].sort((a, b) => a.order - b.order),
        loading: false,
      });
    });
  },

  add: async (uid, name, detail) => {
    const { tasks } = get();
    const maxOrder = tasks.length > 0 ? Math.max(...tasks.map((t) => t.order)) + 1 : 0;
    const task = createTask({ name, detail, order: maxOrder });
    await upsertDoc(uid, 'improvementTasks', task.id, task as unknown as Record<string, unknown>);
  },

  update: async (uid, id, data) => {
    await upsertDoc(uid, 'improvementTasks', id, data as Record<string, unknown>);
  },

  remove: async (uid, id) => {
    await deleteDocById(uid, 'improvementTasks', id);
  },

  reorder: async (uid, fromIndex, toIndex) => {
    const { tasks, update } = get();
    const reordered = [...tasks];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    await Promise.all(
      reordered
        .map((t, i) => ({ task: t, newOrder: i }))
        .filter(({ task, newOrder }) => task.order !== newOrder)
        .map(({ task, newOrder }) => update(uid, task.id, { order: newOrder }))
    );
  },
}));
