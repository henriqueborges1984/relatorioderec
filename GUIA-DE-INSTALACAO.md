# Relatório de Set: guia de instalação

O app é um site estático (pasta `site/`) com uma função privada (`netlify/functions/transcribe.mjs`),
que guarda a chave da OpenAI em segredo. Cada alteração enviada a este repositório publica uma nova versão sozinha.

## 1. Netlify: ligar o site ao repositório
1. Em app.netlify.com: **Add new project → Import an existing project → GitHub**.
2. Autorize o Netlify e escolha o repositório **relatorioderec**.
3. As configurações são lidas do `netlify.toml`. Não mude nada e clique em **Deploy**.
4. Em **Project configuration → General → Project details → Change project name**, use um nome
   fácil, por exemplo `relatorio-set-mooverama`. O endereço fica `https://relatorio-set-mooverama.netlify.app`.

## 2. Netlify: chave da OpenAI e código de acesso
Em **Project configuration → Environment variables → Add a variable**, crie:

| Nome | Valor |
|---|---|
| `OPENAI_API_KEY` | a chave criada em platform.openai.com → API keys |
| `RDS_PASSCODE` | um código seu (ex.: uma frase sem espaços). Ele impede que estranhos usem o seu crédito |
| `OPENAI_TRANSCRIBE_MODEL` | *(opcional)* `gpt-4o-transcribe` para um pouco mais de precisão. O padrão é `gpt-4o-mini-transcribe` |

Depois, em **Deploys → Trigger deploy → Deploy project**, para a função passar a usar as variáveis.

No app, abra **Configurações** (engrenagem na tela inicial), digite o mesmo `RDS_PASSCODE` e toque em
**Salvar e testar**. Isso é feito uma vez por aparelho.

## 3. Google Drive (Google Cloud)
1. Em console.cloud.google.com, crie um projeto (ex.: "Relatorio de Set").
2. **APIs e serviços → Biblioteca**: ative a **Google Drive API**.
3. **APIs e serviços → Tela de consentimento OAuth** (Google Auth Platform):
   - Público: **Interno**, porque a conta é Google Workspace da mooverama.tv. Assim não há revisão do Google.
   - Nome do app: Relatório de Set. E-mail de suporte: o seu.
   - Em Acesso a dados, adicione o escopo `.../auth/drive.file`.
4. **Clientes → Criar cliente → Aplicativo da Web**:
   - Origens JavaScript autorizadas: `https://SEU-SITE.netlify.app`. Se usar um domínio próprio, adicione-o também.
   - Não precisa de URI de redirecionamento.
5. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) e envie para o Claude. Esse ID é
   público, pode mandar no chat. Ele vai em `site/js/config.js`.

O app só enxerga os arquivos que ele mesmo cria no Drive, dentro da pasta "Relatório de Set".

## 4. Usar no celular
Abra o endereço no Chrome (Android) ou no Safari (iPhone). Para ter um ícone, use "Adicionar à tela inicial".
Depois da primeira visita, o app abre sem internet. O que for feito offline vai para o Drive e para a
transcrição quando a conexão voltar.

## Atualizações
Cada nova versão enviada a este repositório é publicada pelo Netlify em cerca de 1 minuto. No celular, basta
fechar e abrir o app.
