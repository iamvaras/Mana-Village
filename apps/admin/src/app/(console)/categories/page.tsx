import type { Metadata } from 'next';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { requireStaff } from '@/features/auth/staff-context';
import { CategoryForm, CategoryRowActions } from '@/features/categories/category-form';
import { PRIORITY_LABEL } from '@/features/issues/labels';
import { getServerServices } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Categories' };

export default async function CategoriesPage() {
  const ctx = await requireStaff();
  if (!ctx.permissions.has('category.manage')) {
    return (
      <div className="max-w-3xl">
        <h1 className="mb-4 text-2xl font-semibold text-neutral-900">Categories</h1>
        <Alert>
          Categories are shared by every village, so only the Super Admin can change them.
        </Alert>
      </div>
    );
  }
  const list = await (await getServerServices()).settings.listCategories();

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Categories</h1>
        <p className="text-sm text-neutral-600">
          The kinds of problem residents pick when reporting. Shared by every village. A hidden
          category stays on old issues but cannot be picked for new ones.
        </p>
      </div>

      <Card title="Add a category">
        <CategoryForm />
      </Card>

      <Card title="All categories">
        {!list.ok ? (
          <Alert tone="error">Could not load categories: {list.error.message}</Alert>
        ) : list.value.length === 0 ? (
          <p className="text-sm text-neutral-600">No categories yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100">
            {list.value.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 py-4 md:flex-row md:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900">
                    {c.name}
                    {c.nameLocal ? (
                      <span className="ml-2 font-normal text-neutral-600">{c.nameLocal}</span>
                    ) : null}
                    {c.isActive ? null : (
                      <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                        Hidden
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-neutral-600">
                    {c.key} · order {c.sortOrder}
                    {c.icon ? ` · icon ${c.icon}` : ''}
                    {c.defaultPriority ? ` · starts ${PRIORITY_LABEL[c.defaultPriority]}` : ''}
                    {c.photoRequired ? ' · photo required' : ' · photo optional'}
                  </p>
                </div>
                <CategoryRowActions category={c} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
