import { supabase } from '../../../lib/supabase';
import type { CustomItem, CustomItemInput } from './custom.types';

const TABLE = 'custom_items';

export async function fetchCustomItems(): Promise<CustomItem[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CustomItem[];
}

export async function createCustomItem(input: CustomItemInput): Promise<CustomItem> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error('You must be signed in to create an item.');
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      name: input.name,
      description: input.description,
      owner_id: userData.user.id,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as CustomItem;
}

export async function updateCustomItem(
  id: string,
  input: CustomItemInput,
): Promise<CustomItem> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ name: input.name, description: input.description })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as CustomItem;
}

export async function deleteCustomItem(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}
