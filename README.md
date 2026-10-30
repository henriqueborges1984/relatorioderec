# Relatório de Set

App de set de gravação da Mooverama:
- projetos com vários vídeos (roteiros .docx da agência);
- diárias com local, GPS e equipe por função;
- plano de filmagem e ordem do dia;
- notas de voz transcritas com pontuação;
- fotos e vídeos;
- relatórios em PDF;
- sincronização com o Google Drive.

Instalação e configuração: veja [GUIA-DE-INSTALACAO.md](GUIA-DE-INSTALACAO.md).

Estrutura:
- `site/`: o app (HTML, CSS e JavaScript, sem build)
- `netlify/functions/transcribe.mjs`: ponte privada com a OpenAI para transcrever áudio
- `netlify.toml`: configuração do Netlify
