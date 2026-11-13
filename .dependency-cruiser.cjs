/** Package dependency rules from design.md "Package dependency rules". */
const ENGINE = [
  'voice-capture',
  'speech-provider',
  'language-normalizer',
  'intent-engine',
  'catalog-matcher',
  'confidence-engine',
  'confirmation-engine',
  'shared-ui',
];
const DOMAIN = ['domain-order', 'domain-billing'];

const pkg = (names) => `^packages/(${names.join('|')})/`;
const alt = (names) => names.join('|');

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Dependencies must be acyclic.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'engine-not-to-domain',
      comment: 'Engine packages never import domain-* packages (Req 1.5).',
      severity: 'error',
      from: { path: pkg(ENGINE) },
      to: {
        path: [pkg(DOMAIN), `@awaaz-kit/(${alt(DOMAIN)})(/|$)`],
      },
    },
    {
      name: 'voice-capture-isolated',
      comment: 'voice-capture imports no other workspace package (Req 4.9).',
      severity: 'error',
      from: { path: '^packages/voice-capture/' },
      to: {
        path: ['^packages/(?!voice-capture/)', '^apps/', '@awaaz-kit/(?!voice-capture(/|$))'],
      },
    },
    {
      name: 'shared-ui-not-to-local-data',
      comment: 'UI never touches persistence (Req 15.3).',
      severity: 'error',
      from: { path: '^packages/shared-ui/' },
      to: { path: ['^packages/local-data/', '@awaaz-kit/local-data(/|$)'] },
    },
    {
      name: 'language-normalizer-isolated',
      comment: 'language-normalizer imports nothing in the workspace.',
      severity: 'error',
      from: { path: '^packages/language-normalizer/' },
      to: {
        path: [
          '^packages/(?!language-normalizer/)',
          '^apps/',
          '@awaaz-kit/(?!language-normalizer(/|$))',
        ],
      },
    },
    {
      name: 'engine-not-to-local-data',
      comment: 'Pure engine packages receive data as arguments, not from local-data.',
      severity: 'error',
      from: {
        path: pkg(['intent-engine', 'catalog-matcher', 'confidence-engine', 'confirmation-engine']),
      },
      to: { path: ['^packages/local-data/', '@awaaz-kit/local-data(/|$)'] },
    },
    {
      name: 'domain-not-to-domain',
      comment: 'domain-order and domain-billing must not import each other.',
      severity: 'error',
      from: { path: '^packages/domain-order/' },
      to: { path: ['^packages/domain-billing/', '@awaaz-kit/domain-billing(/|$)'] },
    },
    {
      name: 'domain-not-to-domain-reverse',
      comment: 'domain-order and domain-billing must not import each other.',
      severity: 'error',
      from: { path: '^packages/domain-billing/' },
      to: { path: ['^packages/domain-order/', '@awaaz-kit/domain-order(/|$)'] },
    },
    {
      name: 'packages-not-to-apps',
      comment: 'Packages never import apps.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'apps-not-to-apps',
      comment: 'Apps must not import each other.',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/([^/]+)/', pathNot: '^apps/$1/' },
    },
    {
      name: 'local-data-and-sync-no-react',
      comment: 'local-data and sync-engine are UI-free.',
      severity: 'error',
      from: { path: '^packages/(local-data|sync-engine)/' },
      to: { path: '^node_modules/(react|react-dom)/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'local-data-not-to-sync-engine',
      comment: 'local-data must not import sync-engine.',
      severity: 'error',
      from: { path: '^packages/local-data/' },
      to: { path: ['^packages/sync-engine/', '@awaaz-kit/sync-engine(/|$)'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|build|coverage|node_modules)/|^spikes/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['main', 'types'],
    },
  },
};
