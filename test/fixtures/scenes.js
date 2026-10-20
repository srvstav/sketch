// Hand-filled scenes in the shape the model returns. Used by the renderer tests and scripts/preview-scenes.js.
export const SCENES = [
  {
    shape: 'machine', title: 'Glycolysis',
    scene: {
      steps: [
        { label: 'Investment phase', note: '2 ATP spent to prime glucose in the cytoplasm', handoff: 'fructose-1,6-bisphosphate', icon: 'coin', stat: '−2 ATP' },
        { label: 'Splitting', note: 'Aldolase cuts the 6-carbon sugar into two 3-carbon halves', handoff: '2 × G3P', icon: 'scissors', stat: '6C → 2×3C' },
        { label: 'Payoff phase', note: '4 ATP and 2 NADH made; net gain is 2 ATP', handoff: '', icon: 'battery', stat: '+4 ATP' },
      ],
      start: 'Glucose (6C)', end: '2 pyruvate (3C)', center: '',
      pitfall: { after: -1, text: '' },
      hook: { at: 1, text: 'Giant red scissors snip the six-car train into two three-car trains' },
    },
  },
  {
    shape: 'cycle', title: 'The Krebs cycle',
    scene: {
      steps: [
        { label: 'Citrate (6C)', note: 'Acetyl-CoA (2C) joins oxaloacetate (4C)', handoff: 'rearranged', icon: 'chain', stat: '2C + 4C' },
        { label: 'α-Ketoglutarate (5C)', note: 'First CO₂ released, NADH made', handoff: 'loses CO₂', icon: 'cloud', stat: '−CO₂' },
        { label: 'Succinyl-CoA (4C)', note: 'Second CO₂ released, NADH made', handoff: 'makes ATP', icon: 'cloud', stat: '−CO₂' },
        { label: 'Succinate', note: 'One ATP (or GTP) per turn', handoff: 'FADH₂ made', icon: 'battery', stat: '+1 ATP' },
        { label: 'Oxaloacetate (4C)', note: 'Regenerated, ready for the next acetyl-CoA', handoff: 'grabs acetyl-CoA', icon: 'recycle', stat: '' },
      ],
      start: 'Acetyl-CoA from pyruvate', end: '2 CO₂, 3 NADH, 1 FADH₂, 1 ATP per turn', center: 'Mitochondrial matrix',
      pitfall: { after: -1, text: '' },
      hook: { at: 4, text: 'The carousel only turns if a new rider (acetyl-CoA) climbs on' },
    },
  },
  {
    shape: 'journey', title: 'Proof by induction',
    scene: {
      steps: [
        { label: 'State P(n)', note: 'Write the claim as a statement about every n', handoff: 'a precise claim', icon: 'pencil', stat: '' },
        { label: 'Base case', note: 'Show P(1) is true by direct check', handoff: 'a foothold', icon: 'flag', stat: 'n = 1' },
        { label: 'Inductive hypothesis', note: 'Assume P(k) holds for some k ≥ 1', handoff: 'P(k)', icon: 'speech', stat: '' },
        { label: 'Inductive step', note: 'Use P(k) to prove P(k+1)', handoff: 'P(k+1)', icon: 'key', stat: 'k → k+1' },
        { label: 'Conclude', note: 'P(n) holds for all n ≥ 1 by induction', handoff: '', icon: 'crown', stat: '' },
      ],
      start: 'A claim about all n', end: 'Proved for every n', center: '',
      pitfall: { after: 2, text: 'Assuming P(k+1) instead of proving it' },
      hook: { at: 1, text: 'Knock over the first domino or nothing else falls' },
    },
  },
  {
    shape: 'dominoes', title: 'Causes of World War I',
    scene: {
      steps: [
        { label: 'Militarism', note: 'Arms race; Germany and Britain build dreadnoughts', handoff: 'readiness for war', icon: 'sword', stat: '' },
        { label: 'Alliances', note: 'Triple Entente vs Triple Alliance tie nations together', handoff: 'one war drags all', icon: 'chain', stat: '3 vs 3' },
        { label: 'Imperialism', note: 'Rivalry for colonies in Africa and Asia', handoff: 'distrust', icon: 'globe', stat: '' },
        { label: 'Nationalism', note: 'Serbian nationalists want Bosnia free of Austria-Hungary', handoff: 'a spark', icon: 'flag', stat: '' },
        { label: 'Assassination', note: 'Franz Ferdinand shot in Sarajevo, 28 June 1914', handoff: '', icon: 'explosion', stat: '28 Jun 1914' },
      ],
      start: 'Rivalry among European great powers', end: 'War declared, August 1914', center: '',
      pitfall: { after: -1, text: '' },
      hook: { at: 4, text: 'One pistol shot topples a row of empires' },
    },
  },
  {
    shape: 'building', title: "Maslow's hierarchy of needs",
    scene: {
      steps: [
        { label: 'Physiological', note: 'Food, water, sleep, warmth', handoff: 'body secure', icon: 'drop', stat: '' },
        { label: 'Safety', note: 'Shelter, health, steady income', handoff: 'stability', icon: 'house', stat: '' },
        { label: 'Love and belonging', note: 'Friends, family, intimacy', handoff: 'acceptance', icon: 'heart', stat: '' },
        { label: 'Esteem', note: 'Respect, status, sense of achievement', handoff: 'confidence', icon: 'crown', stat: '' },
        { label: 'Self-actualisation', note: 'Becoming the most one can be', handoff: '', icon: 'rocket', stat: 'level 5' },
      ],
      start: 'Lower needs must be met before higher ones motivate', end: 'Self-transcendence (later addition)', center: '',
      pitfall: { after: -1, text: '' },
      hook: { at: 0, text: 'No one writes poetry on an empty stomach' },
    },
  },
];

export const MAP = {
  title: 'Cellular respiration',
  ideas: [
    { id: 'i1', title: 'Glycolysis' },
    { id: 'i2', title: 'Link reaction' },
    { id: 'i3', title: 'The Krebs cycle' },
    { id: 'i4', title: 'Electron transport chain' },
    { id: 'i5', title: 'Fermentation' },
  ],
  links: [
    { from: 'i1', to: 'i2', label: 'pyruvate enters the mitochondrion' },
    { from: 'i2', to: 'i3', label: 'acetyl-CoA' },
    { from: 'i3', to: 'i4', label: 'NADH and FADH₂ carry electrons' },
    { from: 'i1', to: 'i5', label: 'no oxygen' },
  ],
};

// Worst case per shape: the most steps allowed and every field near its word limit.
const words = (n, w = 'phosphorylation') => Array.from({ length: n }, (_, i) => (i % 3 ? 'and' : w)).join(' ');
export const STRESS = ['machine', 'cycle', 'journey', 'dominoes', 'building'].map((shape) => ({
  shape,
  title: `Stress test: the longest ${shape} sketch draws`,
  scene: {
    steps: Array.from({ length: shape === 'cycle' ? 7 : 6 }, (_, i) => ({
      label: `Oxidative decarboxylation ${i + 1}`,
      note: `${words(9, 'concentration')} (${i + 1})`,
      handoff: 'two reduced coenzymes',
      icon: 'gear',
      stat: '+12.5 kJ/mol',
    })),
    start: 'Glucose and oxygen from the blood', end: 'Carbon dioxide, water and lots of ATP', center: 'Mitochondrial matrix of the cell',
    pitfall: { after: 2, text: 'Forgetting that the inductive hypothesis must be used in the step' },
    hook: { at: 3, text: 'A conveyor of tiny chefs each passing a hot potato to the next one' },
  },
}));
