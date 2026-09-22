import pg from 'pg';
const p = new pg.Pool({connectionString:'postgresql://postgres:postgres@localhost:5440/essafaria_live'});
const r = await p.query("select a.id, coalesce(a.trading_name,a.legal_name) n, a.balance::text as bal, (select count(*) from users u where u.agency_id=a.id and u.email='b-admin@test.example') as ours from agencies a order by a.balance desc");
console.table(r.rows);
await p.end();
