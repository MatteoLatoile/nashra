'use strict';

const config = require('./runtime-config.json');
const localTest = config.mode === 'local-test';

module.exports = {
  appId: localTest ? 'com.nashra.desktop.localtest' : 'com.nashra.desktop',
  productName: localTest ? 'Nashra Test Local' : 'Nashra',
  directories: {
    output: '../desktop-dist'
  },
  files: [
    'main.cjs',
    'url-policy.cjs',
    'runtime-config.json',
    'offline.html',
    'assets/**/*',
    'package.json'
  ],
  asar: true,
  compression: 'normal',
  win: {
    icon: 'assets/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }],
    executableName: localTest ? 'Nashra-Test-Local' : 'Nashra'
  },
  nsis: {
    oneClick: false,
    perMachine: true,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: localTest ? 'Nashra Test Local' : 'Nashra',
    uninstallDisplayName: localTest ? 'Nashra Test Local' : 'Nashra',
    artifactName: localTest
      ? 'Nashra-Test-Local-Setup-${version}-${arch}.${ext}'
      : 'Nashra-Setup-${version}-${arch}.${ext}'
  },
  publish: null
};
