import { supabase } from '../supabase';

// ---- Types ----

export interface Transaction {
  id: number;
  category_id: number;
  amount: number;
  type: 'income' | 'expense';
  note: string;
  date: string;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  type: 'income' | 'expense' | 'both';
  color: string;
  budget: number;
}

export interface MonthlyReport {
  total_income: number;
  total_expense: number;
  balance: number;
}

export interface CatStat {
  name: string;
  icon: string;
  color: string;
  total: number;
  percentage: number;
  type: string;
}

// ---- Helpers ----

function currentMonthBounds() {
  const now = new Date();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const y = now.getFullYear();
  // Get last day of current month
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { year: y, month: m, start: `${y}-${m}-01`, end: `${y}-${m}-${lastDay}` };
}

// ---- Categories ----

export async function getCategories(type?: 'income' | 'expense'): Promise<Category[]> {
  let query = supabase.from('categories').select('*').order('name');

  if (type) {
    query = query.eq('type', type);
  }

  const { data } = await query;
  return (data as Category[]) || [];
}

export async function addCategory(
  name: string,
  icon: string,
  type: 'income' | 'expense',
  color: string
): Promise<Category | null> {
  const { data } = await supabase
    .from('categories')
    .insert({ name, icon, type, color })
    .select()
    .single();

  return data as Category | null;
}

// ---- Transactions ----

export async function addTransaction(
  categoryId: number,
  amount: number,
  type: 'income' | 'expense',
  note: string,
  date: string
): Promise<void> {
  await supabase.from('transactions').insert({
    category_id: categoryId,
    amount,
    type,
    note,
    date,
  });
}

export async function getTransactions(limit = 50, offset = 0): Promise<Transaction[]> {
  const { data } = await supabase
    .from('transactions')
    .select('*, categories(name, icon, color)')
    .order('date', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (!data) return [];

  return (data as any[]).map((t: any) => ({
    id: t.id,
    category_id: t.category_id,
    amount: Number(t.amount),
    type: t.type,
    note: t.note || '',
    date: t.date,
    category_name: t.categories?.name,
    category_icon: t.categories?.icon,
    category_color: t.categories?.color,
  }));
}

export async function deleteTransaction(id: number): Promise<void> {
  await supabase.from('transactions').delete().eq('id', id);
}

// ---- Monthly Reports ----

export async function getMonthlyReport(): Promise<MonthlyReport> {
  const { start, end } = currentMonthBounds();

  const { data } = await supabase
    .from('transactions')
    .select('amount, type')
    .gte('date', start)
    .lte('date', end);

  const totalIncome = (data || [])
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + Number(t.amount), 0);

  const totalExpense = (data || [])
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + Number(t.amount), 0);

  return {
    total_income: totalIncome,
    total_expense: totalExpense,
    balance: totalIncome - totalExpense,
  };
}

export async function getMonthlyStats(month: number, year: number): Promise<MonthlyReport> {
  const m = month.toString().padStart(2, '0');
  const start = `${year}-${m}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${m}-${lastDay}`;

  const { data } = await supabase
    .from('transactions')
    .select('amount, type')
    .gte('date', start)
    .lte('date', end);

  const totalIncome = (data || [])
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + Number(t.amount), 0);

  const totalExpense = (data || [])
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + Number(t.amount), 0);

  return {
    total_income: totalIncome,
    total_expense: totalExpense,
    balance: totalIncome - totalExpense,
  };
}

export async function getTotalIncome(month: number, year: number): Promise<number> {
  const m = month.toString().padStart(2, '0');
  const start = `${year}-${m}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${m}-${lastDay}`;

  const { data } = await supabase
    .from('transactions')
    .select('amount')
    .eq('type', 'income')
    .gte('date', start)
    .lte('date', end);

  return (data || []).reduce((s, t) => s + Number(t.amount), 0);
}

export async function getTotalExpenses(month: number, year: number): Promise<number> {
  const m = month.toString().padStart(2, '0');
  const start = `${year}-${m}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${m}-${lastDay}`;

  const { data } = await supabase
    .from('transactions')
    .select('amount')
    .eq('type', 'expense')
    .gte('date', start)
    .lte('date', end);

  return (data || []).reduce((s, t) => s + Number(t.amount), 0);
}

export async function getCategoryStats(): Promise<CatStat[]> {
  const { start, end } = currentMonthBounds();

  const [catsRes, txRes] = await Promise.all([
    supabase.from('categories').select('*'),
    supabase
      .from('transactions')
      .select('category_id, amount, type')
      .gte('date', start)
      .lte('date', end),
  ]);

  const categories = (catsRes.data || []) as any[];
  const transactions = (txRes.data || []) as any[];

  const stats = categories.map((cat: any) => {
    const catTx = transactions.filter((t: any) => t.category_id === cat.id);
    const total = catTx.reduce((s: number, t: any) => s + Number(t.amount), 0);
    return {
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      total,
      percentage: 0,
      type: cat.type,
    };
  });

  return stats.sort((a, b) => b.total - a.total);
}

// ---- Chart ----

export async function getMonthlyChart(): Promise<
  { date: string; income: number; expense: number }[]
> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split('T')[0];

  const { data } = await supabase
    .from('transactions')
    .select('date, amount, type')
    .gte('date', startDate)
    .order('date');

  if (!data) return [];

  const map = new Map<string, { income: number; expense: number }>();

  for (const t of data) {
    const entry = map.get(t.date) || { income: 0, expense: 0 };
    if (t.type === 'income') entry.income += Number(t.amount);
    else entry.expense += Number(t.amount);
    map.set(t.date, entry);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }));
}

// ---- Budget Settings ----

export interface BudgetSetting {
  id: number;
  category_id: number;
  monthly_limit: number;
  notify_at: number;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
}

export async function getBudgetSettings(): Promise<BudgetSetting[]> {
  const { data } = await supabase
    .from('budget_settings')
    .select('*, categories(name, icon, color)');

  if (!data) return [];

  return (data as any[]).map((b: any) => ({
    id: b.id,
    category_id: b.category_id,
    monthly_limit: Number(b.monthly_limit),
    notify_at: b.notify_at ?? 80,
    category_name: b.categories?.name,
    category_icon: b.categories?.icon,
    category_color: b.categories?.color,
  }));
}

export async function upsertBudgetLimit(
  categoryId: number,
  monthlyLimit: number
): Promise<void> {
  await supabase.from('budget_settings').upsert(
    { category_id: categoryId, monthly_limit: monthlyLimit },
    { onConflict: 'category_id' }
  );
}

export async function deleteAllTransactions(): Promise<void> {
  await supabase.from('transactions').delete().neq('id', 0);
}
