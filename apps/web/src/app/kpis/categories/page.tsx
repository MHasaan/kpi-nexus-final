'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Pencil, X } from 'lucide-react';

import {
  ApiError,
  clearTokens,
  createKpiCategory,
  deleteKpiCategory,
  getAccessToken,
  listKpiCategories,
  updateKpiCategory,
  type KpiCategory,
} from '../../../lib/api-client';
import { AppShell } from '../../../components/app-shell';
import { PermissionGuard } from '../../../components/auth/permission-guard';
import { RequirePermission } from '../../../components/auth/require-permission';
import { KpiSubnav } from '../../../components/kpis/kpi-subnav';
import {
  Button,
  Card,
  Input,
  Label,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui';

/** A valid 3/6-digit hex color usable by <input type="color">. */
function toColorInputValue(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) || /^#[0-9a-fA-F]{3}$/.test(value) ? value : '#4f46e5';
}

export default function KpiCategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<KpiCategory[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [icon, setIcon] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editSortOrder, setEditSortOrder] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setCategories(await listKpiCategories());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load categories');
    }
  }, [router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router, refresh]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await createKpiCategory({
        name: name.trim(),
        color: color.trim() || undefined,
        icon: icon.trim() || undefined,
      });
      setName('');
      setColor('');
      setIcon('');
      await refresh();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create category');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setLoadError(null);
    try {
      await deleteKpiCategory(id);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to delete category');
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(category: KpiCategory) {
    setEditingId(category.id);
    setEditName(category.name);
    setEditColor(category.color ?? '');
    setEditIcon(category.icon ?? '');
    setEditSortOrder(String(category.sortOrder));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleSaveEdit(id: string) {
    setBusyId(id);
    setEditError(null);
    try {
      const trimmedColor = editColor.trim();
      const trimmedIcon = editIcon.trim();
      const parsedSortOrder = Number.parseInt(editSortOrder, 10);
      await updateKpiCategory(id, {
        name: editName.trim(),
        color: trimmedColor || undefined,
        icon: trimmedIcon || undefined,
        sortOrder: Number.isNaN(parsedSortOrder) ? undefined : parsedSortOrder,
      });
      setEditingId(null);
      await refresh();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Failed to update category');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <RequirePermission permission="KPI_VIEW">
    <AppShell
      title="Categories"
      crumbs={[
        { label: 'Home', href: '/' },
        { label: 'KPIs', href: '/kpis' },
        { label: 'Categories' },
      ]}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <h1
            className="text-2xl font-bold tracking-tight text-content-strong"
            data-testid="categories-heading"
          >
            KPI categories
          </h1>
          <p className="text-sm text-content-muted">
            Group KPIs by category. A category color and icon are used as the KPI accent in lists and charts.
          </p>
        </div>

        <KpiSubnav />

        <PermissionGuard permission="KPI_EDIT">
        <Card className="p-0">
          <div className="border-b border-border-divider px-5 py-4">
            <h2 className="text-sm font-semibold text-content-strong">Add category</h2>
          </div>
          <div className="p-5">
            <form
              onSubmit={handleCreate}
              className="flex flex-wrap items-end gap-3"
              data-testid="category-create-form"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category-name" required>
                  Name
                </Label>
                <Input
                  id="category-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  data-testid="category-name-input"
                  className="w-56"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category-color">
                  Color <span className="text-content-muted">(optional)</span>
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Pick color"
                    value={toColorInputValue(color)}
                    onChange={(e) => setColor(e.target.value)}
                    data-testid="category-color-swatch"
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-surface-bg p-0.5"
                  />
                  <Input
                    id="category-color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    data-testid="category-color-input"
                    placeholder="#4f46e5"
                    className="w-32"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category-icon">
                  Icon <span className="text-content-muted">(optional)</span>
                </Label>
                <Input
                  id="category-icon"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  data-testid="category-icon-input"
                  placeholder="TrendingUp"
                  className="w-40"
                />
                <span className="text-xs text-content-muted">lucide icon name</span>
              </div>
              <Button type="submit" disabled={creating} isLoading={creating} data-testid="category-create-submit">
                Add
              </Button>
            </form>
            {createError && (
              <p role="alert" data-testid="category-create-error" className="mt-3 text-sm text-status-critical">
                {createError}
              </p>
            )}
          </div>
        </Card>
        </PermissionGuard>

        {loadError && (
          <div
            role="alert"
            data-testid="categories-error"
            className="rounded-lg border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        {categories === null && !loadError && (
          <Card className="p-4">
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </Card>
        )}

        {categories && categories.length === 0 && (
          <Card>
            <div className="px-6 py-12 text-center text-sm text-content-muted" data-testid="categories-empty">
              No categories yet.
            </div>
          </Card>
        )}

        {categories && categories.length > 0 && (
          <Card className="overflow-hidden p-0">
            <Table data-testid="categories-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Icon</TableHead>
                  <TableHead className="text-right">KPIs</TableHead>
                  <TableHead className="text-right">Sort</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => {
                  const isEditing = editingId === c.id;
                  const inUse = c._count.kpis > 0;
                  return (
                  <TableRow
                    key={c.id}
                    data-testid={`category-row-${c.id}`}
                    className={
                      isEditing
                        ? 'bg-accent-bg hover:bg-accent-bg ring-1 ring-inset ring-accent-primary/40'
                        : undefined
                    }
                  >
                    <TableCell className="font-medium text-content-strong">
                      {isEditing ? (
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          minLength={2}
                          aria-label="Category name"
                          data-testid={`category-edit-name-${c.id}`}
                          className="w-48"
                        />
                      ) : (
                        c.name
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            aria-label="Pick category color"
                            value={toColorInputValue(editColor)}
                            onChange={(e) => setEditColor(e.target.value)}
                            data-testid={`category-edit-color-swatch-${c.id}`}
                            className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-border bg-surface-bg p-0.5"
                          />
                          <Input
                            value={editColor}
                            onChange={(e) => setEditColor(e.target.value)}
                            placeholder="#4f46e5"
                            aria-label="Category color"
                            data-testid={`category-edit-color-${c.id}`}
                            className="w-28"
                          />
                        </div>
                      ) : c.color ? (
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: c.color }}
                          />
                          <span className="font-mono text-xs text-content-muted">{c.color}</span>
                        </span>
                      ) : (
                        <span className="text-content-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          value={editIcon}
                          onChange={(e) => setEditIcon(e.target.value)}
                          placeholder="TrendingUp"
                          aria-label="Category icon (lucide name)"
                          data-testid={`category-edit-icon-${c.id}`}
                          className="w-36"
                        />
                      ) : c.icon ? (
                        <span className="font-mono text-xs text-content-muted">{c.icon}</span>
                      ) : (
                        <span className="text-content-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-content-muted">
                      {c._count.kpis}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-content-muted">
                      {isEditing ? (
                        <Input
                          type="number"
                          value={editSortOrder}
                          onChange={(e) => setEditSortOrder(e.target.value)}
                          aria-label="Sort order"
                          data-testid={`category-edit-sortorder-${c.id}`}
                          className="ml-auto w-20 text-right tabular-nums"
                        />
                      ) : (
                        c.sortOrder
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="inline-flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleSaveEdit(c.id)}
                            disabled={busyId === c.id || editName.trim().length < 2}
                            isLoading={busyId === c.id}
                            data-testid={`category-edit-save-${c.id}`}
                          >
                            <Check className="h-4 w-4" aria-hidden="true" />
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelEdit}
                            disabled={busyId === c.id}
                            data-testid={`category-edit-cancel-${c.id}`}
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                            Cancel
                          </Button>
                        </div>
                      ) : (
                      <PermissionGuard permission="KPI_EDIT">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(c)}
                          disabled={busyId === c.id || editingId !== null}
                          data-testid={`category-edit-${c.id}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDelete(c.id)}
                          disabled={busyId === c.id || inUse}
                          title={inUse ? `Reassign ${c._count.kpis} KPIs first` : undefined}
                          data-testid={`category-delete-${c.id}`}
                          className="text-status-critical hover:bg-status-critical-bg"
                        >
                          Delete
                        </Button>
                      </div>
                      </PermissionGuard>
                      )}
                      {isEditing && editError && (
                        <p
                          role="alert"
                          data-testid={`category-edit-error-${c.id}`}
                          className="mt-2 text-sm text-status-critical"
                        >
                          {editError}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </AppShell>
    </RequirePermission>
  );
}
