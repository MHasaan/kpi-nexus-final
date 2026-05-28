declare module 'react-grid-layout' {
  import type { ComponentType, ReactElement, ReactNode } from 'react';

  export interface Layout {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
    static?: boolean;
    isDraggable?: boolean;
    isResizable?: boolean;
  }

  export interface GridLayoutProps {
    layout?: Layout[];
    cols?: number;
    rowHeight?: number;
    width?: number;
    margin?: [number, number];
    containerPadding?: [number, number];
    isDraggable?: boolean;
    isResizable?: boolean;
    draggableHandle?: string;
    draggableCancel?: string;
    useCSSTransforms?: boolean;
    compactType?: 'vertical' | 'horizontal' | null;
    onLayoutChange?: (layout: Layout[]) => void;
    onDragStart?: (layout: Layout[], oldItem: Layout, newItem: Layout, placeholder: Layout, event: MouseEvent, element: HTMLElement) => void;
    onDrag?: (layout: Layout[], oldItem: Layout, newItem: Layout, placeholder: Layout, event: MouseEvent, element: HTMLElement) => void;
    onDragStop?: (layout: Layout[], oldItem: Layout, newItem: Layout, placeholder: Layout, event: MouseEvent, element: HTMLElement) => void;
    onResizeStop?: (layout: Layout[], oldItem: Layout, newItem: Layout, placeholder: Layout, event: MouseEvent, element: HTMLElement) => void;
    children?: ReactNode;
    className?: string;
    style?: React.CSSProperties;
  }

  const GridLayout: ComponentType<GridLayoutProps>;
  export default GridLayout;
}

declare module 'react-resizable' {
  export interface ResizableBoxProps {
    width: number;
    height: number;
    children?: import('react').ReactNode;
  }
}
