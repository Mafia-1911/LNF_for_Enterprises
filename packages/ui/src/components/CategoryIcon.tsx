// A category's icon by catalog code. Rendered through createElement so the icon component is
// looked up from a static map, not created during render.
import { createElement } from 'react';
import { categoryIcon } from '../icons';

export function CategoryIcon({ code, size = 28 }: { code: string; size?: number }) {
  return createElement(categoryIcon(code), { size, 'aria-hidden': true });
}
