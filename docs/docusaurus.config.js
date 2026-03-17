// @ts-check
const { themes } = require('prism-react-renderer');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'LearnFlow Docs',
  tagline: 'AI-Powered Python Tutoring Platform',
  favicon: 'img/favicon.ico',
  url: 'http://localhost',
  baseUrl: '/',
  organizationName: 'RukhsarMalik',
  projectName: 'learnflow-app',
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
  i18n: { defaultLocale: 'en', locales: ['en'] },
  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: { sidebarPath: require.resolve('./sidebars.js'), routeBasePath: '/' },
        blog: false,
        theme: {},
      }),
    ],
  ],
  themeConfig: /** @type {import('@docusaurus/preset-classic').ThemeConfig} */ ({
    navbar: {
      title: '⚡ LearnFlow',
      items: [
        { type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs' },
        { href: 'https://github.com/RukhsarMalik/hackathon-3_learnflow-app', label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      copyright: `Built with Skills + Claude Code · Hackathon III`,
    },
    prism: { theme: themes.github, darkTheme: themes.dracula },
  }),
};
module.exports = config;
