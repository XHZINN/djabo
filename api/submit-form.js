import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// ============================
// Configuração PostgreSQL
// ============================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ============================
// Supabase
// ============================
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ============================
// Multer (para processar arquivos)
// ============================
const storage = multer.memoryStorage();
const upload = multer({ storage });
const cpUpload = upload.fields([
  { name: 'imagem-capa', maxCount: 1 },
  { name: 'arq-jogo', maxCount: 1 } // novo arquivo do jogo
]);

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => result instanceof Error ? reject(result) : resolve(result));
  });
}

export const config = { api: { bodyParser: false } };

// ============================
// Função auxiliar: inserir ou obter ID em tabelas relacionais
// ============================
async function inserirOuObterId(pool, nomeTabela, campoNome, valor) {
  const result = await pool.query(
    `INSERT INTO ${nomeTabela} (${campoNome}) VALUES ($1)
     ON CONFLICT (${campoNome}) DO UPDATE SET ${campoNome}=EXCLUDED.${campoNome}
     RETURNING id`,
    [valor]
  );
  return result.rows[0].id;
}

// ============================
// Função auxiliar: converter GB/MB
// ============================
function converterParaMB(valor) {
  if (!valor) return null;
  const v = valor.toString().trim().toLowerCase();
  if (v.endsWith('gb')) return parseFloat(v.replace('gb',''))*1024;
  if (v.endsWith('mb')) return parseFloat(v.replace('mb',''));
  return parseFloat(v);
}

// ============================
// Função auxiliar: upload para Supabase
// ============================
async function uploadParaSupabase(buffer, nomeArquivo, pasta) {
  const { data, error } = await supabase.storage
    .from('jogos') // nome do bucket
    .upload(`${pasta}/${nomeArquivo}`, buffer, { upsert: true });
  if (error) throw error;

  const { publicUrl } = supabase.storage.from('jogos').getPublicUrl(`${pasta}/${nomeArquivo}`);
  return publicUrl;
}

// ============================
// Handler principal
// ============================
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Método não permitido');

  await runMiddleware(req, res, cpUpload);

  const client = await pool.connect();
  try {
    const {
      name, descricao, preco, data_lanc, dev, quantidade,
      cpuMin, gpuMin, ramMin, soMin, directxMin, storageMin,
      cpuRec, gpuRec, ramRec, soRec, directxRec, storageRec
    } = req.body;

    const dataLancamento = data_lanc ? new Date(data_lanc).toISOString().split('T')[0] : null;
    const precoCorrigido = preco.replace(',', '.');

    await client.query('BEGIN');

    // ============================
    // Inserir jogo
    // ============================
    const resultJogo = await client.query(
      `INSERT INTO jogos (nome, dev, preco, data_lanc, descricao, quantidade, cont_midia, cont_capa)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [name, dev, parseFloat(precoCorrigido), dataLancamento, descricao, quantidade, [], '']
    );
    const jogoId = resultJogo.rows[0].id;

    // ============================
    // Gêneros
    // ============================
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

    // ============================
    // Idiomas
    // ============================
    const idiomas = req.body.idioma ? (Array.isArray(req.body.idioma) ? req.body.idioma : [req.body.idioma]) : [];
    for (const idioma of idiomas) {
      const idiomaId = await inserirOuObterId(pool, 'idiomas', 'nome', idioma);
      await client.query(`INSERT INTO jogos_idiomas (jogo_id, idioma_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [jogoId, idiomaId]);
    }

    // ============================
    // Plataformas
    // ============================
    const plataformas = req.body.plataforma ? (Array.isArray(req.body.plataforma) ? req.body.plataforma : [req.body.plataforma]) : [];
    for (const plataforma of plataformas) {
      const plataformaId = await inserirOuObterId(pool, 'plataformas', 'nome', plataforma);
      await client.query(`INSERT INTO jogos_plataformas (jogo_id, plataforma_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [jogoId, plataformaId]);
    }

    // ============================
    // Requisitos
    // ============================
    await client.query(
      `INSERT INTO "Requisitos"
        (id_jogo, "min_cpu", "min_gpu", "min_ram", "min_so", "min_dir", "min_rom",
         "max_cpu", "max_gpu", "max_ram", "max_so", "max_dir", "max_rom")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        jogoId,
        cpuMin, gpuMin, converterParaMB(ramMin), soMin, directxMin, converterParaMB(storageMin),
        cpuRec, gpuRec, converterParaMB(ramRec), soRec, directxRec, converterParaMB(storageRec)
      ]
    );

    // ============================
    // Upload arquivos para Supabase
    // ============================
    const pastaSupabase = `${name.replace(/\s+/g, '_')}_${jogoId}`;
    let urlCapa = null, urlArquivoJogo = null;

    if (req.files['imagem-capa']?.[0]) {
      const file = req.files['imagem-capa'][0];
      urlCapa = await uploadParaSupabase(file.buffer, file.originalname, `${pastaSupabase}/Capa`);
    }

    if (req.files['arq-jogo']?.[0]) {
      const file = req.files['arq-jogo'][0];
      urlArquivoJogo = await uploadParaSupabase(file.buffer, file.originalname, `${pastaSupabase}/Arquivos`);
    }

    // ============================
    // Atualiza URLs no banco
    // ============================
    await client.query(`UPDATE jogos SET cont_capa=$1, cont_midia=array_append(cont_midia, $2) WHERE id=$3`,
      [urlCapa, urlArquivoJogo, jogoId]
    );

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
