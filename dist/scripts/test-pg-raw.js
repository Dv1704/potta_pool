import pkg from 'pg';
const { Client } = pkg;
import 'dotenv/config';
const client = new Client({
    connectionString: "postgresql://potta_user:SecurePottaPassword123!@144.91.111.151:5432/potta_db?sslmode=disable",
});
async function main() {
    try {
        await client.connect();
        console.log('Successfully connected to Contabo DB!');
        const res = await client.query('SELECT id, email FROM "User" LIMIT 1');
        console.log('User found:', res.rows[0]);
    }
    catch (err) {
        console.error('Connection error:', err.message);
    }
    finally {
        await client.end();
    }
}
main();
