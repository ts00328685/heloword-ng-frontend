/**
 * Converts common LaTeX math notation to Unicode equivalents.
 * Handles $...$ inline math and $$...$$ display math blocks.
 */

const COMMANDS: Record<string, string> = {
  // Arrows
  rightarrow: '→',
  Rightarrow: '⇒',
  leftarrow: '←',
  Leftarrow: '⇐',
  leftrightarrow: '↔',
  Leftrightarrow: '⇔',
  uparrow: '↑',
  Uparrow: '⇑',
  downarrow: '↓',
  Downarrow: '⇓',
  updownarrow: '↕',
  Updownarrow: '⇕',
  nearrow: '↗',
  searrow: '↘',
  swarrow: '↙',
  nwarrow: '↖',
  longrightarrow: '⟶',
  longleftarrow: '⟵',
  Longrightarrow: '⟹',
  Longleftarrow: '⟸',
  longleftrightarrow: '⟷',
  Longleftrightarrow: '⟺',
  mapsto: '↦',
  to: '→',
  gets: '←',
  hookrightarrow: '↪',
  hookleftarrow: '↩',
  rightharpoonup: '⇀',
  rightharpoondown: '⇁',
  leftharpoonup: '↼',
  leftharpoondown: '↽',

  // Greek lowercase
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  varpi: 'ϖ',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',

  // Greek uppercase
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',

  // Operators & relations
  times: '×',
  div: '÷',
  cdot: '·',
  pm: '±',
  mp: '∓',
  leq: '≤',
  geq: '≥',
  le: '≤',
  ge: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  equiv: '≡',
  sim: '∼',
  simeq: '≃',
  cong: '≅',
  propto: '∝',
  ll: '≪',
  gg: '≫',
  subset: '⊂',
  supset: '⊃',
  subseteq: '⊆',
  supseteq: '⊇',
  in: '∈',
  notin: '∉',
  ni: '∋',
  cup: '∪',
  cap: '∩',
  setminus: '∖',
  emptyset: '∅',
  varnothing: '∅',
  forall: '∀',
  exists: '∃',
  nexists: '∄',
  neg: '¬',
  lnot: '¬',
  land: '∧',
  lor: '∨',
  wedge: '∧',
  vee: '∨',
  oplus: '⊕',
  otimes: '⊗',
  ominus: '⊖',
  oslash: '⊘',
  odot: '⊙',
  circ: '∘',
  bullet: '•',
  star: '⋆',
  ast: '∗',
  dagger: '†',
  ddagger: '‡',

  // Calculus / analysis
  partial: '∂',
  nabla: '∇',
  infty: '∞',
  int: '∫',
  iint: '∬',
  iiint: '∭',
  oint: '∮',
  sum: '∑',
  prod: '∏',
  coprod: '∐',
  sqrt: '√',

  // Misc symbols
  hbar: 'ℏ',
  ell: 'ℓ',
  wp: '℘',
  Re: 'ℜ',
  Im: 'ℑ',
  aleph: 'ℵ',
  beth: 'ℶ',
  angle: '∠',
  perp: '⊥',
  parallel: '∥',
  mid: '∣',
  nmid: '∤',
  vdots: '⋮',
  cdots: '⋯',
  ddots: '⋱',
  ldots: '…',
  dots: '…',
  prime: '′',
  degree: '°',

  // Logic / proof
  therefore: '∴',
  because: '∵',
  vdash: '⊢',
  models: '⊨',
  top: '⊤',
  bot: '⊥',

  // Brackets & spacing (strip)
  quad: ' ',
  qquad: '  ',
  ',': '',
  ';': '',
  ':': '',
  '!': '',
};

/** Convert a single LaTeX command or simple expression to Unicode. */
function convertToken(inner: string): string {
  // Strip leading/trailing whitespace
  inner = inner.trim();

  // Handle \command sequences inside the math block
  const result = inner.replace(/\\([A-Za-z]+|[^A-Za-z\s])/g, (_, cmd) => {
    return COMMANDS[cmd] ?? `\\${cmd}`;
  });

  // Superscripts: x^{2} → x², x^2 → x²  (common digits/+-n)
  const superMap: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', 'n': 'ⁿ', 'i': 'ⁱ',
  };
  const subscriptMap: Record<string, string> = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    '+': '₊', '-': '₋', 'n': 'ₙ', 'i': 'ᵢ', 'j': 'ⱼ',
  };

  return result
    .replace(/\^\{([^}]+)\}/g, (_, g) => [...g].map(c => superMap[c] ?? c).join(''))
    .replace(/\^([0-9+\-ni])/g, (_, c) => superMap[c] ?? `^${c}`)
    .replace(/_\{([^}]+)\}/g, (_, g) => [...g].map(c => subscriptMap[c] ?? c).join(''))
    .replace(/_([0-9+\-nij])/g, (_, c) => subscriptMap[c] ?? `_${c}`)
    // Remove remaining braces used for grouping
    .replace(/\{([^{}]*)\}/g, '$1')
    // Collapse extra spaces
    .replace(/ {2,}/g, ' ');
}

export function latexToUnicode(text: string): string {
  // Display math $$...$$
  text = text.replace(/\$\$([^$]+)\$\$/g, (_, inner) => convertToken(inner));
  // Inline math $...$
  text = text.replace(/\$([^$\n]+)\$/g, (_, inner) => convertToken(inner));
  return text;
}
