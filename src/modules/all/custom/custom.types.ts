export interface CustomItem {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
}

export interface CustomItemInput {
  name: string;
  description: string;
}

export interface CustomState {
  items: CustomItem[];
  loading: boolean;
  error: string | null;
}

export type CustomAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: CustomItem[] }
  | { type: 'FETCH_ERROR'; payload: string }
  | { type: 'ADD_ITEM'; payload: CustomItem }
  | { type: 'UPDATE_ITEM'; payload: CustomItem }
  | { type: 'REMOVE_ITEM'; payload: string };
