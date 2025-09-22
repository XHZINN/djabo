// ============================
// PASSO 1 – Importar módulos
// ============================
import express from 'express';
import multer from 'multer';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js'

dotenv.config();

// ============================
// PASSO 2 – Criar pasta uploads
// ============================
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// ============================
// PASSO 3 – Conexão PostgreSQL
// ============================
const supabaseUrl = 'https://tofmwbxkrigmeyrgsnvq.supabase.co'
const supabaseKey = process.env.SUPABASE_KEY // ⬅️ USE ASSIM MESMO!
const supabase = createClient(supabaseUrl, supabaseKey)

export default supabase

// Teste de conexão
supabase.from('jogos').select('*').limit(1)
  .then(({ data, error }) => {
    if (error) {
      console.error('❌ Erro Supabase:', error);
    } else {
      console.log('✅ Conectado ao Supabase! Dados:', data);
    }
  });

function converterParaMB(valor) {
  if (!valor) return null;

  // Normaliza o valor (remove espaços e transforma em minúsculas)
  const v = valor.toString().trim().toLowerCase();

  if (v.endsWith('gb')) {
    const numero = parseFloat(v.replace('gb', '').trim());
    return numero * 1024; // converte GB para MB
  } else if (v.endsWith('mb')) {
    const numero = parseFloat(v.replace('mb', '').trim());
    return numero; // já está em MB
  } else {
    // se não tiver unidade, assume MB
    return parseFloat(v);
  }
}


// ============================
// PASSO 4 – Configurar servidor Express
// ============================
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// ============================
// PASSO 5 – Configurar Multer (uploads)
// ============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, file.originalname),
});

const upload = multer({ storage });
const cpUpload = upload.fields([
  { name: 'imagem-capa', maxCount: 1 },
]);

// ============================
// FUNÇÃO AUXILIAR: insere em tabela relacional.
// ============================
async function inserirOuObterId(nomeTabela, campoNome, valor) {
  const result = await pool.query(
    `INSERT INTO ${nomeTabela} (${campoNome}) VALUES ($1)
     ON CONFLICT (${campoNome}) DO UPDATE SET ${campoNome}=EXCLUDED.${campoNome}
     RETURNING id`,
    [valor]
  );
  return result.rows[0].id;
}

// ============================
// PASSO 6 – Rota para receber formulário
// ============================
app.post('/submit-form', cpUpload, async (req, res) => {
  const client = await pool.connect();
  try {
    console.log('Dados recebidos no corpo:', req.body);
    console.log('Arquivos recebidos:', req.files);

    // ====== Dados principais do jogo ======
    const { name, descricao, preco, data_lanc, dev, quantidade } = req.body;
    const dataLancamento = req.body['data-lanc'] ? new Date(req.body['data-lanc']).toISOString().split('T')[0] : null;

    const precoCorrigido = preco.replace(',', '.');

    await client.query('BEGIN');

    const directxMin = req.body.directxMin;
    const directxRec = req.body.directxRec;

    // ====== Insert na tabela jogos ======
    const resultJogo = await client.query(
      `INSERT INTO jogos (nome, dev, preco, data_lanc, descricao, quantidade, cont_midia, cont_capa)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [name, dev, parseFloat(precoCorrigido), dataLancamento, descricao, quantidade, [], '']
    );
    const jogoId = resultJogo.rows[0].id;

    // ====== Generos ======
    const generosSelecionados = Object.keys(req.body).filter(key =>
      ["acao","aventura","rpg","esporte","corrida","estrategia","simulacao",
       "terror","puzzle","mmo","musica","plataforma","sandbox","luta","tiro",
       "sobrevivencia","visualnovel","party","educacional","casual","roguelike","indie"
      ].includes(key)
    );

    for (const genero of generosSelecionados) {
      const generoId = await inserirOuObterId('generos', 'nome', genero);
      await client.query(
        `INSERT INTO jogos_generos (jogo_id, genero_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [jogoId, generoId]
      );
    }

    // ====== Idiomas ======
    const idiomas = req.body.idioma
      ? Array.isArray(req.body.idioma) ? req.body.idioma : [req.body.idioma]
      : [];

    for (const idioma of idiomas) {
      const idiomaId = await inserirOuObterId('idiomas', 'nome', idioma);
      await client.query(
        `INSERT INTO jogos_idiomas (jogo_id, idioma_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [jogoId, idiomaId]
      );
    }

    // ====== Plataformas ======
    const plataformas = req.body.plataforma
      ? Array.isArray(req.body.plataforma) ? req.body.plataforma : [req.body.plataforma]
      : [];

    for (const plataforma of plataformas) {
      const plataformaId = await inserirOuObterId('plataformas', 'nome', plataforma);
      await client.query(
        `INSERT INTO jogos_plataformas (jogo_id, plataforma_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [jogoId, plataformaId]
      );
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

    // ====== Criar pastas e salvar arquivos ======
    const pastaJogo = `uploads/${name.replace(/\s+/g, '_')}_${jogoId}`;
    const pastaCapa = path.join(pastaJogo, 'Capa');

    if (!fs.existsSync(pastaJogo)) fs.mkdirSync(pastaJogo, { recursive: true });
    if (!fs.existsSync(pastaCapa)) fs.mkdirSync(pastaCapa, { recursive: true });

    const arquivosProcessados = new Set();
    let caminhoImagemCapa = null;

    if (req.files) {
      if (req.files['imagem-capa']?.[0]) {
        const file = req.files['imagem-capa'][0];
        const novoCaminho = path.join(pastaCapa, file.originalname);
        fs.renameSync(file.path, novoCaminho);
        caminhoImagemCapa = novoCaminho;
        arquivosProcessados.add(file.originalname);
      }

    }

    // Atualizar caminhos
    await client.query(
      `UPDATE jogos SET cont_capa=$1 WHERE id=$2`,
      [ caminhoImagemCapa, jogoId]
    );

    await client.query('COMMIT');
    res.status(201).send('Jogo cadastrado com sucesso!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao cadastrar jogo:', error);
    res.status(500).send('Erro ao cadastrar jogo.');
  } finally {
    client.release();
  }
});


// Rota para listar todos os jogos
app.get('/api/jogos', async (req, res) => {
  try {
    const { data: jogos, error } = await supabase
      .from('jogos')
      .select('id, nome, cont_capa');
    
    if (error) {
      console.error('Erro Supabase:', error);
      return res.status(500).json({ error: 'Erro ao carregar jogos' });
    }
    
    res.json(jogos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar jogos' });
  }
});

// Rota para buscar detalhes de um jogo específico (COM SUPABASE)
app.get('/api/jogos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Busca os dados do jogo
    const { data: jogoData, error: jogoError } = await supabase
      .from('jogos')
      .select('*')
      .eq('id', id)
      .single();

    if (jogoError) {
      console.error('Erro ao buscar jogo:', jogoError);
      return res.status(404).json({ error: 'Jogo não encontrado' });
    }

    // Busca os requisitos do jogo
    const { data: requisitosData, error: requisitosError } = await supabase
      .from('Requisitos')
      .select('*')
      .eq('id_jogo', id)
      .single();

    if (requisitosError && requisitosError.code !== 'PGRST116') {
      // PGRST116 significa "nenhum resultado encontrado", o que é ok
      console.error('Erro ao buscar requisitos:', requisitosError);
    }

    // Combina os dados do jogo com os requisitos
    const resultado = {
      ...jogoData,
      ...(requisitosData || {}) // Se não houver requisitos, usa objeto vazio
    };

    res.json(resultado);
  } catch (err) {
    console.error('Erro geral:', err);
    res.status(500).json({ error: 'Erro ao carregar o jogo' });
  }
});
// ============================
// PASSO 7 – Subir servidor
// ============================
app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});
