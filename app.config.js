module.exports = ({ config }) => {
  if (process.env.GITHUB_PAGES !== 'true') {
    return config;
  }

  return {
    ...config,
    experiments: {
      ...config.experiments,
      baseUrl: '/vsc-proj-1',
    },
  };
};
