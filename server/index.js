const express = require('express');
const cookieParser = require('cookie-parser');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const db = new Database('./tokens.db');

app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// Middleware: Validação de cookie
function autenticaUser(req, res, next) {
  const user = req.cookies.userID;
  if (!user) return res.redirect('/sem-autorizacao.html');
  req.userID = user;
  next();
}

// Rota dinâmica por modelo
app.get('/modelo/:slug', (req, res) => {
  const slug = req.params.slug;
  const jsonPath = path.join(__dirname, `../public/modelos/${slug}.json`);
  if (!fs.existsSync(jsonPath)) return res.status(404).send('Modelo não encontrado');

  const modelo = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  if (!req.cookies.userID) {
    const userID = Math.random().toString(36).substring(2, 11);
    res.cookie("userID", userID, { path: '/', sameSite: 'Strict' });
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="robots" content="noindex,nofollow" />
      <title>${modelo.nome}</title>
      <style>
        body {
          margin: 0;
          background: url('/assets/${modelo.imagem}') no-repeat center top fixed;
          background-size: contain;
          background-color: black;
          height: 100vh;
          overflow: hidden;
        }
      </style>
      <script>
        !function(f,b,e,v,n,t,s){
          if(f.fbq)return;n=f.fbq=function(){
            n.callMethod ? n.callMethod.apply(n,arguments) : n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)
        }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${modelo.pixel_id}');
        fbq('track', 'PageView');
        fbq('track', 'ViewContent', {
          content_name: 'Prelander ${modelo.nome}',
          value: 0.00,
          currency: 'BRL'
        });
        setTimeout(() => {
          window.location.href = '/gera?plano=${modelo.plano}&valor=${modelo.valor}';
        }, 5000);
      </script>
    </head>
    <body></body>
    </html>
  `);
});

// Gera token
app.get('/gera', autenticaUser, (req, res) => {
  const plano = req.query.plano;
  const valor = parseFloat(req.query.valor);
  const user = req.userID;

  if (!plano || isNaN(valor) || valor < 10 || valor > 100) {
    return res.redirect('/sem-autorizacao.html');
  }

  const existente = db.prepare('SELECT token FROM tokens WHERE user = ? AND plano = ? AND used IS NULL').get(user, plano);
  if (existente) return res.redirect(`/obrigado?token=${existente.token}`);

  const token = require('crypto').randomBytes(8).toString('hex');
  db.prepare('INSERT INTO tokens (token, valor, user, plano) VALUES (?, ?, ?, ?)').run(token, valor, user, plano);

  return res.redirect(`/obrigado?token=${token}`);
});

// Obrigado
app.get('/obrigado', autenticaUser, (req, res) => {
  const token = req.query.token;
  if (!token) return res.send('Token ausente.');

  const row = db.prepare('SELECT * FROM tokens WHERE token = ?').get(token);
  if (!row || row.used) return res.send('Token inválido ou já utilizado.');

  db.prepare('UPDATE tokens SET used = CURRENT_TIMESTAMP WHERE token = ?').run(token);
  const { valor, plano } = row;

  res.send(`
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>Compra Confirmada</title>
    <script>
      setTimeout(() => {
        fbq('track', 'Purchase', {
          value: ${valor},
          currency: 'BRL',
          content_name: 'Plano ${plano}'
        });
      }, 3000);
      setTimeout(() => {
        window.location.href = "${plano.includes('hadrielle') ? 'https://t.me/+UEmVhhccVMw3ODcx' : 'https://t.me/joinchat'}";
      }, 5000);
    </script>
    </head>
    <body style="background:black; color:white; text-align:center; padding-top:100px;">
      <h1>Compra confirmada!</h1>
      <p>Valor: R$${valor.toFixed(2)} - Plano ${plano}</p>
      <p>Seu acesso será liberado em instantes.</p>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando na porra da porta ${PORT}`));