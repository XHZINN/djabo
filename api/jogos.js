import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const { id } = req.query;

  try {
    if (id) {
      const { rows } = await pool.query(
        `SELECT j.*, r.min_cpu, r.min_gpu, r.min_ram, r.min_so, r.min_dir, r.min_rom,
                r.max_cpu, r.max_gpu, r.max_ram, r.max_so, r.max_dir, r.max_rom
         FROM jogos j
         LEFT JOIN "Requisitos" r ON j.id = r.id_jogo
         WHERE j.id=$1`,
        [id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Jogo não encontrado' });
      res.json(rows[0]);
    } else {
      const { rows: jogos } = await pool.query(`SELECT id, nome, cont_capa AS imagem_capa FROM jogos`);
      res.json(jogos);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar jogos' });
  }
}
