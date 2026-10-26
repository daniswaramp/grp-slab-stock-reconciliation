import { neon } from '../node_modules/@neondatabase/serverless/index.mjs';

const sql = neon(process.env.DATABASE_URL);

async function inspect() {
  const [opnameCount] = await sql`SELECT count(*)::int as count FROM opname_records;`;
  console.log(`Live opname_records count: ${opnameCount.count}`);

  const [sapCount] = await sql`SELECT count(*)::int as count FROM sap_stock;`;
  const [motherCount] = await sql`SELECT count(*)::int as count FROM mother_slab_stock;`;
  const [cutCount] = await sql`SELECT count(*)::int as count FROM cut_slab_stock;`;
  console.log(`Current counts:`);
  console.log(`- sap_stock: ${sapCount.count}`);
  console.log(`- mother_slab_stock: ${motherCount.count}`);
  console.log(`- cut_slab_stock: ${cutCount.count}`);

  const sampleSap = await sql`SELECT * FROM sap_stock WHERE batch_id = '19L2533A' LIMIT 1;`;
  console.log(`Sample 19L2533A currently in sap_stock:`, sampleSap);

  const columnsSap = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'sap_stock';
  `;
  console.log('sap_stock columns:', columnsSap);
}

inspect().catch(err => {
  console.error('Inspection error:', err);
  process.exit(1);
});
