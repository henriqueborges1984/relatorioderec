// Site settings. The Google client ID is public (it is not a secret);
// the OpenAI key never goes here: it lives in Netlify's environment variables.
export default {
  // Filled in after the Google Cloud step (see GUIA-DE-INSTALACAO.md)
  googleClientId: '',
  // Private function on Netlify that forwards audio to OpenAI
  transcribeEndpoint: '/.netlify/functions/transcribe',
  driveRootName: 'Relatório de Set'
};
