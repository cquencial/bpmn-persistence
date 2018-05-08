Package.describe({
  name: 'cquencial:bpmn-persistence',
  version: '0.1.0',
  // Brief, one-line summary of the package.
  summary: 'Provides a persistence layer for cquencial:bpmn-engine',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function (api) {
  api.versionsFrom('1.6');
  api.use([
    'check',
    'ecmascript',
    'mongo',
    'sha',
    'cquencial:bpmn-engine@0.1.0',
  ]);
  api.addFiles('bpmn-persistence.js');
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use('meteor');
  api.use('check');
  api.use('mongo');
  api.use('random');
  api.use('sha');
  api.use('cquencial:bpmn-persistence');
  api.use('meteortesting:mocha');
  api.use('practicalmeteor:chai');
  api.mainModule('bpmn-persistence-tests.js');
});