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
  { name: 'arquivo-jogo', maxCount: 1 } // NOVO: arquivo do jogo
]);

// ============================
// FUNÇÃO AUXILIAR: insere em tabela relacional.
// ============================
// FUNÇÃO AUXILIAR: insere em tabela relacional (usando Supabase)
async function inserirOuObterId(nomeTabela, campoNome, valor) {
  // Verifica se já existe
  const { data: existing, error: selectError } = await supabase
    .from(nomeTabela)
    .select('id')
    .eq(campoNome, valor)
    .single();

  if (selectError && selectError.code !== 'PGRST116') {
    throw selectError;
  }

  if (existing) {
    return existing.id;
  }

  // Se não existe, insere
  const { data: newRecord, error: insertError } = await supabase
    .from(nomeTabela)
    .insert({ [campoNome]: valor })
    .select('id')
    .single();

  if (insertError) throw insertError;
  return newRecord.id;
}

// ============================
// PASSO 6 – Rota para receber formulário
// ============================
app.post('/submit-form', cpUpload, async (req, res) => {
  try {
    console.log('Dados recebidos no corpo:', req.body);
    console.log('Arquivos recebidos:', req.files);

    // ====== Dados principais do jogo ======
    const { name, descricao, preco, data_lanc, dev } = req.body; // REMOVE quantidade
    const dataLancamento = req.body['data-lanc'] ? new Date(req.body['data-lanc']).toISOString().split('T')[0] : null;
    const precoCorrigido = preco.replace(',', '.');
    const directxMin = req.body.directxMin;
    const directxRec = req.body.directxRec;

    // ====== Insert na tabela jogos ======
    const { data: jogoData, error: jogoError } = await supabase
      .from('jogos')
      .insert({
        nome: name,
        dev: dev,
        preco: parseFloat(precoCorrigido),
        data_lanc: dataLancamento,
        descricao: descricao,
        cont_midia: [],
        cont_capa: '',
        arq_jogos: '' // NOVA COLUNA para armazenar caminho do arquivo
      })
      .select('id')
      .single();

    if (jogoError) throw jogoError;
    const jogoId = jogoData.id;

    // ====== Generos ======
    const generosSelecionados = Object.keys(req.body).filter(key =>
      ["acao","aventura","rpg","esporte","corrida","estrategia","simulacao",
       "terror","puzzle","mmo","musica","plataforma","sandbox","luta","tiro",
       "sobrevivencia","visualnovel","party","educacional","casual","roguelike","indie"
      ].includes(key)
    );

    for (const genero of generosSelecionados) {
      const generoId = await inserirOuObterId('generos', 'nome', genero);
      
      const { error: generoError } = await supabase
        .from('jogos_generos')
        .insert({
          jogo_id: jogoId,
          genero_id: generoId
        });

      if (generoError && generoError.code !== '23505') { // 23505 = unique violation (já existe)
        throw generoError;
      }
    }

    // ====== Idiomas ======
    const idiomas = req.body.idioma
      ? Array.isArray(req.body.idioma) ? req.body.idioma : [req.body.idioma]
      : [];

    for (const idioma of idiomas) {
      const idiomaId = await inserirOuObterId('idiomas', 'nome', idioma);
      
      const { error: idiomaError } = await supabase
        .from('jogos_idiomas')
        .insert({
          jogo_id: jogoId,
          idioma_id: idiomaId
        });

      if (idiomaError && idiomaError.code !== '23505') {
        throw idiomaError;
      }
    }

    // ====== Plataformas ======
    const plataformas = req.body.plataforma
      ? Array.isArray(req.body.plataforma) ? req.body.plataforma : [req.body.plataforma]
      : [];

    for (const plataforma of plataformas) {
      const plataformaId = await inserirOuObterId('plataformas', 'nome', plataforma);
      
      const { error: plataformaError } = await supabase
        .from('jogos_plataformas')
        .insert({
          jogo_id: jogoId,
          plataforma_id: plataformaId
        });

      if (plataformaError && plataformaError.code !== '23505') {
        throw plataformaError;
      }
    }

    // ====== Requisitos ======
    const { error: requisitosError } = await supabase
      .from('Requisitos')
      .insert({
        id_jogo: jogoId,
        min_cpu: req.body.cpuMin,
        min_gpu: req.body.gpuMin,
        min_ram: converterParaMB(req.body.ramMin),
        min_so: req.body.soMin,
        min_dir: directxMin,
        min_rom: converterParaMB(req.body.storageMin),
        max_cpu: req.body.cpuRec,
        max_gpu: req.body.gpuRec,
        max_ram: converterParaMB(req.body.ramRec),
        max_so: req.body.soRec,
        max_dir: directxRec,
        max_rom: converterParaMB(req.body.storageRec)
      });

    if (requisitosError) throw requisitosError;

    // ====== Criar pastas e salvar arquivos ======
     const pastaJogo = `uploads/${name.replace(/\s+/g, '_')}_${jogoId}`;
    const pastaCapa = path.join(pastaJogo, 'Capa');
    const pastaArquivos = path.join(pastaJogo, 'Arquivos'); // NOVA PASTA

    if (!fs.existsSync(pastaJogo)) fs.mkdirSync(pastaJogo, { recursive: true });
    if (!fs.existsSync(pastaCapa)) fs.mkdirSync(pastaCapa, { recursive: true });
    if (!fs.existsSync(pastaArquivos)) fs.mkdirSync(pastaArquivos, { recursive: true });

    let caminhoImagemCapa = null;
    let caminhoArquivoJogo = null;

    // Processar imagem da capa
    if (req.files && req.files['imagem-capa']?.[0]) {
      const file = req.files['imagem-capa'][0];
      const novoCaminho = path.join(pastaCapa, file.originalname);
      fs.renameSync(file.path, novoCaminho);
      caminhoImagemCapa = novoCaminho;
    }

    // Processar arquivo do jogo (NOVO)
    if (req.files && req.files['arquivo-jogo']?.[0]) {
      const file = req.files['arquivo-jogo'][0];
      const novoCaminho = path.join(pastaArquivos, file.originalname);
      fs.renameSync(file.path, novoCaminho);
      caminhoArquivoJogo = novoCaminho;
    }

    // ====== Atualizar caminhos no banco ======
    const { error: updateError } = await supabase
      .from('jogos')
      .update({ 
        cont_capa: caminhoImagemCapa,
        arq_jogos: caminhoArquivoJogo // SALVAR CAMINHO DO ARQUIVO
      })
      .eq('id', jogoId);

    if (updateError) throw updateError;

    res.status(201).send('Jogo cadastrado com sucesso!');
  } catch (error) {
    console.error('Erro ao cadastrar jogo:', error);
    res.status(500).send('Erro ao cadastrar jogo: ' + error.message);
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

// Rota para download do arquivo do jogo
app.get('/download/:jogoId', async (req, res) => {
  try {
    const jogoId = req.params.jogoId;
    
    // Buscar informações do jogo no banco
    const { data: jogo, error } = await supabase
      .from('jogos')
      .select('arq_jogos, nome')
      .eq('id', jogoId)
      .single();

    if (error || !jogo) {
      return res.status(404).send('Jogo não encontrado');
    }

    if (!jogo.arq_jogos) {
      return res.status(404).send('Arquivo do jogo não disponível');
    }

    // Verificar se o arquivo existe
    if (!fs.existsSync(jogo.arq_jogos)) {
      return res.status(404).send('Arquivo não encontrado no servidor');
    }

    // Configurar headers para download
    const filename = path.basename(jogo.arq_jogos);
    res.setHeader('Content-Disposition', `attachment; filename="${jogo.nome.replace(/\s+/g, '_')}_${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    // Enviar arquivo
    res.download(jogo.arq_jogos);

  } catch (error) {
    console.error('Erro no download:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// ============================
// PASSO 7 – Subir servidor
// ============================
app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});
