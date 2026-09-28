import { useCallback, useEffect, useReducer } from 'react';
import { customReducer, initialCustomState } from './custom.reducer';
import {
  createCustomItem,
  deleteCustomItem,
  fetchCustomItems,
  updateCustomItem,
} from './custom.service';
import type { CustomItemInput } from './custom.types';

export function useCustom() {
  const [state, dispatch] = useReducer(customReducer, initialCustomState);

  const load = useCallback(async () => {
    dispatch({ type: 'FETCH_START' });
    try {
      const items = await fetchCustomItems();
      dispatch({ type: 'FETCH_SUCCESS', payload: items });
    } catch (error) {
      dispatch({
        type: 'FETCH_ERROR',
        payload: error instanceof Error ? error.message : 'Failed to load items.',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(async (input: CustomItemInput) => {
    const item = await createCustomItem(input);
    dispatch({ type: 'ADD_ITEM', payload: item });
    return item;
  }, []);

  const update = useCallback(async (id: string, input: CustomItemInput) => {
    const item = await updateCustomItem(id, input);
    dispatch({ type: 'UPDATE_ITEM', payload: item });
    return item;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteCustomItem(id);
    dispatch({ type: 'REMOVE_ITEM', payload: id });
  }, []);

  return { state, load, add, update, remove };
}
