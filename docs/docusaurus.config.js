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
        theme: { customCss: require.resolve('./src/css/custom.css') },
      }),
    ],
  ],
  themeConfig: /** @type {import('@docusaurus/preset-classic').ThemeConfig} */ ({
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    announcementBar: {
      id: 'hackathon',
      content: '⚡ <strong>LearnFlow</strong> — AI-Powered Python Learning Platform · Built at Hackathon III',
      backgroundColor: '#6c63ff',
      textColor: '#ffffff',
      isCloseable: true,
    },
    navbar: {
      title: 'LearnFlow',
      logo: { alt: 'LearnFlow', src: 'img/logo.svg', srcDark: 'img/logo.svg' },
      items: [
        { type: 'docSidebar', sidebarId: 'docs', position: 'left', label: '📖 Documentation' },
        { href: 'http://localhost:30300', label: '🚀 Open App', position: 'right' },
        { href: 'https://github.com/RukhsarMalik/hackathon-3_learnflow-app', label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Introduction', to: '/' },
            { label: 'Architecture', to: '/architecture' },
            { label: 'Services', to: '/services' },
            { label: 'API Reference', to: '/api' },
          ],
        },
        {
          title: 'Platform',
          items: [
            { label: 'Open App', href: 'http://localhost:30300' },
            { label: 'GitHub', href: 'https://github.com/RukhsarMalik/hackathon-3_learnflow-app' },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} LearnFlow · Built with Claude Code · Hackathon III`,
    },
    prism: { theme: themes.github, darkTheme: themes.dracula },
  }),
};
module.exports = config;
