/**
 * A serialisable snapshot of an element and its surroundings, captured while the element's
 * primary selector still works. It is later compared against candidates to heal a broken selector.
 */
export interface ElementFingerprint {
  tag: string;
  /** Explicit `role` attribute or the implicit ARIA role derived from the tag. */
  role: string;
  id: string;
  classes: string[];
  /** Selected stable attributes: name, type, placeholder, title, aria-label, href, data-qa, data-testid... */
  attributes: Record<string, string>;
  /** Normalised visible text (truncated). */
  text: string;
  /** Approximation of the accessible name (aria-label, <label>, placeholder, title, text). */
  accessibleName: string;
  context: {
    /** Text of an associated <label> or the closest preceding sibling's text (e.g. <dt> for a <dd>). */
    label: string;
    /** Parent's text with the element's own text removed (truncated). */
    parentText: string;
    /** aria-labels / captions / headings of the closest named ancestors, nearest first. */
    ancestorLabels: string[];
  };
  /** Ancestor tag names, nearest first. */
  path: string[];
  childCount: number;
  textLength: number;
}

/** What the store persists for every (pageId, elementKey) pair. */
export interface ElementRecord {
  pageId: string;
  elementKey: string;
  selector: string;
  fingerprint: ElementFingerprint;
  updatedAt: string;
}

/** A live element on the page considered as a healing target. */
export interface Candidate {
  selector: string;
  fingerprint: ElementFingerprint;
}
