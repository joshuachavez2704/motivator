import pg from 'pg'

// A pool keeps a few connections open and hands them out as needed.
// Creating it does not connect yet, so a missing DATABASE_URL does not crash startup;
// the first query would fail instead.
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })