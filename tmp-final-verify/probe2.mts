import pg from 'pg';
const p = new pg.Pool({connectionString:'postgresql://postgres:postgres@localhost:5440/essafaria_live'});
const r = await p.query("select id, application_id, first_name, full_name, nationality from applicants order by created_at desc limit 3");
console.table(r.rows);
await p.end();
