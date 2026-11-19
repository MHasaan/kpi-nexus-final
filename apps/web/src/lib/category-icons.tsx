import {
  BarChart3,
  Clock,
  DollarSign,
  Heart,
  Leaf,
  type LucideIcon,
  Package,
  ShieldCheck,
  ShoppingCart,
  Smile,
  Star,
  Target,
  TrendingUp,
  Truck,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';

/**
 * The icons a KPI category may have, by the name stored for it, with words to
 * offer them by. The field used to be a free-text box asking for "a lucide
 * icon name", and nothing drew what was typed. A stored name not on this list
 * (typed before) is kept and shown as text; it is just not drawn.
 */
export const CATEGORY_ICONS: ReadonlyArray<{ name: string; label: string; Icon: LucideIcon }> = [
  { name: 'DollarSign', label: 'Money', Icon: DollarSign },
  { name: 'TrendingUp', label: 'Growth', Icon: TrendingUp },
  { name: 'Target', label: 'Target', Icon: Target },
  { name: 'BarChart3', label: 'Chart', Icon: BarChart3 },
  { name: 'Users', label: 'People', Icon: Users },
  { name: 'Smile', label: 'Satisfaction', Icon: Smile },
  { name: 'Heart', label: 'Health', Icon: Heart },
  { name: 'ShoppingCart', label: 'Sales', Icon: ShoppingCart },
  { name: 'Truck', label: 'Delivery', Icon: Truck },
  { name: 'Package', label: 'Stock', Icon: Package },
  { name: 'Clock', label: 'Time', Icon: Clock },
  { name: 'Zap', label: 'Speed', Icon: Zap },
  { name: 'Wrench', label: 'Operations', Icon: Wrench },
  { name: 'ShieldCheck', label: 'Quality and risk', Icon: ShieldCheck },
  { name: 'Leaf', label: 'Sustainability', Icon: Leaf },
  { name: 'Star', label: 'Highlight', Icon: Star },
];

/** The drawable icon stored under `name`, or null when there is none to draw. */
export function categoryIcon(name: string | null | undefined): LucideIcon | null {
  return CATEGORY_ICONS.find((i) => i.name === name)?.Icon ?? null;
}
