import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Configuração PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Função auxiliar para converter GB/MB
function converterParaMB(valor) {
  if (!valor) return null;
  const v = valor.toString().trim().toLowerCase();
  if (v.endsWith('gb')) return parseFloat(v.replace('gb',''))*1024;
  if (v.endsWith('mb')) return parseFloat(v.replace('mb',''));
  return parseFloat(v);
}

// Configuração do Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });
const cpUpload = upload.fields([{ name: 'imagem-capa', maxCount: 1 }]);

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) reject(result)
      else resolve(result)
    });
  });
}

// Desativar bodyParser do Vercel para usar Multer
export const config = { api: { bodyParser: false } };

// Função auxiliar para inserir ou obter ID em tabelas relacionais
async function inserirOuObterId(pool, nomeTabela, campoNome, valor) {
  const result = await pool.query(
    `INSERT INTO ${nomeTabela} (${campoNome}) VALUES ($1)
     ON CONFLICT (${campoNome}) DO UPDATE SET ${campoNome}=EXCLUDED.${campoNome}
     RETURNING id`,
    [valor]
  );
  return result.rows[0].id;
}

// Handler Serverless
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Método não permitido');

  await runMiddleware(req, res, cpUpload);

  const client = await pool.connect();
  try {
    const { name, descricao, preco, data_lanc, dev, quantidade } = req.body;
    const dataLancamento = req.body['data-lanc'] ? new Date(req.body['data-lanc']).toISOString().split('T')[0] : null;
    const precoCorrigido = preco.replace(',', '.');

    await client.query('BEGIN');

    // Inserir jogo
    const resultJogo = await client.query(
      `INSERT INTO jogos (nome, dev, preco, data_lanc, descricao, quantidade, cont_midia, cont_capa)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [name, dev, parseFloat(precoCorrigido), dataLancamento, descricao, quantidade, [], '']
    );
    const jogoId = resultJogo.rows[0].id;

    // ====== Gêneros ======
    const generosSelecionados = Object.keys(req.body).filter(key =>
      ["acao","aventura","rpg","esporte","corrida","estrategia","simulacao",
       "terror","puzzle","mmo","musica","plataforma","sandbox","luta","tiro",
       "sobrevivencia","visualnovel","party","educacional","casual","roguelike","indie"
      ].includes(key)
    );

    for (const genero of generosSelecionados) {
      const generoId = await inserirOuObterId(pool, 'generos', 'nome', genero);
      await client.query(`INSERT INTO jogos_generos (jogo_id, genero_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [jogoId, generoId]);
    }

    // ====== Idiomas ======
    const idiomas = req.body.idioma ? (Array.isArray(req.body.idioma) ? req.body.idioma : [req.body.idioma]) : [];
    for (const idioma of idiomas) {
      const idiomaId = await inserirOuObterId(pool, 'idiomas', 'nome', idioma);
      await client.query(`INSERT INTO jogos_idiomas (jogo_id, idioma_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [jogoId, idiomaId]);
    }

    // ====== Plataformas ======
    const plataformas = req.body.plataforma ? (Array.isArray(req.body.plataforma) ? req.body.plataforma : [req.body.plataforma]) : [];
    for (const plataforma of plataformas) {
      const plataformaId = await inserirOuObterId(pool, 'plataformas', 'nome', plataforma);
      await client.query(`INSERT INTO jogos_plataformas (jogo_id, plataforma_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [jogoId, plataformaId]);
    }

    // ====== Requisitos ======
    await client.query(
      `INSERT INTO "Requisitos"
        (id_jogo, "min_cpu", "min_gpu", "min_ram", "min_so", "min_dir", "min_rom",
         "max_cpu", "max_gpu", "max_ram", "max_so", "max_dir", "max_rom")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        jogoId,
        req.body.cpuMin, req.body.gpuMin, converterParaMB(req.body.ramMin), req.body.soMin, req.body.directxMin, converterParaMB(req.body.storageMin),
        req.body.cpuRec, req.body.gpuRec, converterParaMB(req.body.ramRec), req.body.soRec, req.body.directxRec, converterParaMB(req.body.storageRec)
      ]
    );

    // ====== Upload de arquivos ======
    const pastaJogo = `uploads/${name.replace(/\s+/g, '_')}_${jogoId}`;
    if (!fs.existsSync(pastaJogo)) fs.mkdirSync(pastaJogo, { recursive: true });

    let caminhoImagemCapa = null;
    if (req.files?.['imagem-capa']?.[0]) {
      const file = req.files['imagem-capa'][0];
      const novoCaminho = path.join(pastaJogo, file.originalname);
      fs.renameSync(file.path, novoCaminho);
      caminhoImagemCapa = novoCaminho;
    }

    await client.query(`UPDATE jogos SET cont_capa=$1 WHERE id=$2`, [caminhoImagemCapa, jogoId]);

    await client.query('COMMIT');
    res.status(201).json({ message: 'Jogo cadastrado com sucesso!', id: jogoId });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar jogo' });
  } finally {
    client.release();
  }
}
