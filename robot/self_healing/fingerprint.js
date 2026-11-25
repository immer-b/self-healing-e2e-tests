/*
 * Runs INSIDE the browser through Selenium's execute_script:
 *   return (<this function>)(arguments[0], arguments[1]);
 *
 * A plain-JavaScript port of playwright/e2e-framework/src/fingerprint/browserScript.ts. Both produce
 * the same fingerprint format, so the two frameworks can share one element store.
 *
 * - fingerprint:    describe `target`.
 * - candidates:     fingerprint every visible element under `target` with a selector relative to it.
 * - groupSelector:  given a candidate selector, return a selector matching it and its similar siblings.
 */
function browserScript(target, request) {
  const IGNORED_TAGS = new Set(['script', 'style', 'head', 'meta', 'link', 'title', 'br', 'noscript', 'template', 'path', 'svg']);
  const KEPT_ATTRIBUTES = ['name', 'type', 'placeholder', 'title', 'aria-label', 'href', 'data-qa', 'data-testid', 'data-test', 'for'];
  const MAX_PARENT_TEXT = 80;
  const doc = target.ownerDocument;
  const isDocumentRoot = target === doc.documentElement;

  const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
  const truncate = (s, n = 120) => (s.length > n ? s.slice(0, n) : s);
  const textOf = (el) => (el ? norm(el.innerText ?? el.textContent) : '');

  const implicitRole = (el) => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    switch (tag) {
      case 'button': return 'button';
      case 'a': return el.hasAttribute('href') ? 'link' : '';
      case 'select': return 'combobox';
      case 'textarea': return 'textbox';
      case 'input':
        if (['button', 'submit', 'reset'].includes(type)) return 'button';
        if (type === 'checkbox' || type === 'radio') return type;
        if (type === 'search') return 'searchbox';
        return 'textbox';
      case 'tr': return 'row';
      case 'td': return 'cell';
      case 'th': return 'columnheader';
      case 'li': return 'listitem';
      case 'ul': case 'ol': return 'list';
      case 'table': return 'table';
      case 'dt': return 'term';
      case 'dd': return 'definition';
      case 'nav': return 'navigation';
      case 'aside': return 'complementary';
      case 'form': return 'form';
      case 'dialog': return 'dialog';
      case 'img': return 'img';
      case 'section': return el.hasAttribute('aria-label') ? 'region' : '';
      default: return /^h[1-6]$/.test(tag) ? 'heading' : '';
    }
  };

  const normalisedType = (el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') return (el.getAttribute('type') ?? 'text').toLowerCase();
    if (tag === 'button') return (el.getAttribute('type') ?? 'submit').toLowerCase();
    return undefined;
  };

  const associatedLabel = (el) => {
    if (el.id) {
      const label = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return textOf(label);
    }
    const wrapping = el.closest('label');
    return wrapping ? textOf(wrapping) : '';
  };

  const accessibleName = (el) => {
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy.split(/\s+/).map((id) => textOf(doc.getElementById(id))).join(' ');
      if (norm(text)) return norm(text);
    }
    const candidates = [
      el.getAttribute('aria-label'),
      associatedLabel(el),
      el.getAttribute('placeholder'),
      el.getAttribute('title'),
      el.getAttribute('alt'),
    ];
    const found = candidates.map(norm).find(Boolean);
    if (found) return found;
    return ['button', 'link', 'menuitem', 'tab', 'heading', 'cell', 'listitem'].includes(implicitRole(el)) ? truncate(textOf(el), 80) : '';
  };

  const nearbyLabel = (el) => {
    const label = associatedLabel(el);
    if (label) return label;
    const sibling = (node) => (node && !node.querySelector('input,select,textarea,button') ? textOf(node) : '');
    return truncate(sibling(el.previousElementSibling) || sibling(el.nextElementSibling), 80);
  };

  const ancestorLabels = (el) => {
    const labels = [];
    for (let node = el.parentElement; node && labels.length < 3; node = node.parentElement) {
      const label =
        node.getAttribute('aria-label') ||
        node.querySelector(':scope > caption, :scope > legend')?.textContent ||
        '';
      if (norm(label)) labels.push(norm(label));
    }
    return labels;
  };

  const fingerprint = (el) => {
    const text = textOf(el);
    const parentText = textOf(el.parentElement);
    const attributes = {};
    for (const name of KEPT_ATTRIBUTES) {
      const value = norm(el.getAttribute(name));
      if (value) attributes[name] = value;
    }
    const type = normalisedType(el);
    if (type) attributes.type = type;

    const path = [];
    for (let node = el.parentElement; node && path.length < 6; node = node.parentElement) path.push(node.tagName.toLowerCase());

    return {
      tag: el.tagName.toLowerCase(),
      role: implicitRole(el),
      id: el.id,
      classes: [...el.classList],
      attributes,
      text: truncate(text),
      accessibleName: accessibleName(el),
      context: {
        label: nearbyLabel(el),
        // Only small parents carry meaningful context; a big container's text is just noise.
        parentText: parentText.length <= MAX_PARENT_TEXT ? norm(parentText.replace(text, '')) : '',
        ancestorLabels: ancestorLabels(el),
      },
      path,
      childCount: el.children.length,
      textLength: text.length,
    };
  };

  const isVisible = (el) => {
    if (!el.getClientRects().length) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  };

  const uniqueInDocument = (selector) => doc.querySelectorAll(selector).length === 1;

  /** Builds a selector for `el`: global for the document root, `:scope > ...` relative to a scope otherwise. */
  const selectorFor = (el) => {
    if (isDocumentRoot) {
      if (el.id && uniqueInDocument(`#${CSS.escape(el.id)}`)) return `#${CSS.escape(el.id)}`;
      for (const attr of ['data-qa', 'data-testid', 'data-test']) {
        const value = el.getAttribute(attr);
        if (value && uniqueInDocument(`[${attr}="${CSS.escape(value)}"]`)) return `[${attr}="${CSS.escape(value)}"]`;
      }
    }
    const parts = [];
    let node = el;
    while (node && node !== target) {
      if (isDocumentRoot && node.id && uniqueInDocument(`#${CSS.escape(node.id)}`)) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        return parts.join(' > ');
      }
      const parent = node.parentElement;
      const tag = node.tagName.toLowerCase();
      const current = node;
      const sameTag = parent ? [...parent.children].filter((c) => c.tagName === current.tagName) : [node];
      parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(node) + 1})` : tag);
      node = parent;
    }
    return isDocumentRoot ? `html > ${parts.join(' > ')}` : `:scope > ${parts.join(' > ')}`;
  };

  switch (request.mode) {
    case 'fingerprint':
      return fingerprint(target);

    case 'candidates': {
      const result = [];
      for (const el of target.querySelectorAll('*')) {
        if (result.length >= request.maxCandidates) break;
        if (IGNORED_TAGS.has(el.tagName.toLowerCase()) || !isVisible(el)) continue;
        result.push({ selector: selectorFor(el), fingerprint: fingerprint(el) });
      }
      return result;
    }

    case 'groupSelector': {
      const el = (isDocumentRoot ? doc : target).querySelector(request.selector);
      if (!el?.parentElement) return request.selector;
      const tag = el.tagName.toLowerCase();
      const classes = [...el.classList].map((c) => `.${CSS.escape(c)}`).join('');
      const role = el.getAttribute('role') ? `[role="${CSS.escape(el.getAttribute('role'))}"]` : '';
      // Exclude same-tag siblings that carry extra classes (e.g. a header row styled as a row).
      const ownClasses = new Set(el.classList);
      const extraClasses = new Set(
        [...el.parentElement.children]
          .filter((c) => c.tagName === el.tagName)
          .flatMap((c) => [...c.classList])
          .filter((c) => !ownClasses.has(c)),
      );
      const exclusions = [...extraClasses].map((c) => `:not(.${CSS.escape(c)})`).join('');
      const parentSelector = el.parentElement === target ? '' : selectorFor(el.parentElement);
      const item = `${tag}${classes}${role}${exclusions}`;
      if (!parentSelector) return isDocumentRoot ? item : `:scope > ${item}`;
      return `${parentSelector} > ${item}`;
    }

    default:
      throw new Error(`unknown mode ${request.mode}`);
  }
}
